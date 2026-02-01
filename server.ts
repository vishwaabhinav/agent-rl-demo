import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import next from "next";
import WebSocket from "ws";
import * as db from "./src/lib/db";
import type {
  CaseData,
  FSMState,
  Message,
  PolicyConfig,
  TurnTrace,
} from "./src/lib/types";
import { policyEngine } from "./src/lib/engine/policy";

// Import from extracted voice module
import {
  type VoiceSession,
  type CallStatus,
  isValidTransition,
  classifyStateWithLLM,
  shouldApplyTransition,
  buildAgentInstructions,
  buildGreetingTrigger,
  buildStateTransitionPrompt,
} from "./src/lib/voice";

// Import simulation module
import {
  runSimulation,
  stopSimulation,
  getPersonaById,
  type SimulationSession,
  type SimulationConfig,
  type OrchestratorCallbacks,
} from "./src/simulation";

// Import learners for loading saved state
import { BanditLearner, QLearner, createLearnerFromState, createFreshLearner } from "./src/rl/learners";
import type { Learner, RLAction } from "./src/rl/types";
import { extractState, type SessionContext } from "./src/rl/environment/state-extractor";
import * as fs from "fs";
import * as path from "path";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

// =============================================================================
// Session Management
// =============================================================================

const sessions = new Map<string, VoiceSession>();
const simulations = new Map<string, SimulationSession>();

// =============================================================================
// OpenAI Realtime API Connection
// =============================================================================

function createRealtimeConnection(
  session: VoiceSession,
  io: SocketIOServer
): WebSocket {
  const url = "wss://api.openai.com/v1/realtime?model=gpt-realtime";

  console.log("[Realtime] Creating WebSocket connection to:", url);
  console.log("[Realtime] API Key present:", !!process.env.OPENAI_API_KEY);

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  ws.on("open", () => {
    console.log(`[Realtime] Connected for session ${session.id}`);
    console.log(`[Realtime] RL learner present: ${!!session.learner}`);

    // Configure the session with debt collection agent persona
    const instructions = buildAgentInstructions(session.caseData, session.policyConfig);

    // When RL learner is present, disable auto-response so we can inject policy decisions
    const createResponse = !session.learner;

    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions,
          voice: "coral",
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "en",
          },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "medium",
            create_response: createResponse,
            interrupt_response: true,
          },
        },
      })
    );
  });

  ws.on("message", (data: WebSocket.Data) => {
    try {
      const event = JSON.parse(data.toString());
      handleRealtimeEvent(event, session, io);
    } catch (error) {
      console.error("[Realtime] Parse error:", error);
    }
  });

  ws.on("error", (error) => {
    console.error(`[Realtime] Error for session ${session.id}:`, error);
    io.to(session.id).emit("realtime:error", { error: error.message });
  });

  ws.on("close", () => {
    console.log(`[Realtime] Disconnected for session ${session.id}`);
    if (session.status === "active") {
      session.status = "ended";
      io.to(session.id).emit("call:ended", { reason: "realtime_disconnected" });
    }
  });

  return ws;
}

function handleRealtimeEvent(
  event: any,
  session: VoiceSession,
  io: SocketIOServer
): void {
  const { type } = event;
  const emit = (eventName: string, data: any) => io.to(session.id).emit(eventName, data);

  switch (type) {
    case "session.created":
      console.log(`[Realtime] Session created`);
      break;

    case "session.updated":
      console.log(`[Realtime] Session updated - triggering initial greeting`);
      if (session.realtimeWs && session.realtimeWs.readyState === WebSocket.OPEN) {
        session.realtimeWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: buildGreetingTrigger() }],
            },
          })
        );
        session.realtimeWs.send(JSON.stringify({ type: "response.create" }));
        console.log("[Realtime] Sent greeting request");
      } else {
        console.error("[Realtime] Cannot send greeting - WebSocket not open");
      }
      break;

    case "input_audio_buffer.speech_started":
      emit("voice:userSpeaking", { speaking: true });
      break;

    case "input_audio_buffer.speech_stopped":
      emit("voice:userSpeaking", { speaking: false });

      // If RL learner is present, inject policy decision and trigger response
      if (session.learner && session.realtimeWs) {
        const ws = session.realtimeWs;

        // Build session context for state extraction
        const sessionContext: SessionContext = {
          fsmContext: {
            currentState: session.currentState,
            stateHistory: session.stateHistory,
            slots: {
              identity_verified: session.stateHistory.includes("DEBT_CONTEXT"),
              disclosure_complete: session.stateHistory.includes("DEBT_CONTEXT"),
            },
          },
          caseData: session.caseData,
          messages: session.messages,
          signalHistory: [],
          actionHistory: [],
          turnCount: session.turnIndex,
        };

        // Extract RL state and select action
        const rlState = extractState(sessionContext);
        const allowedActions: RLAction[] = ["PROCEED", "EMPATHIZE", "OFFER_PLAN", "ASK_CLARIFY"];
        const action = session.learner.selectAction(rlState, allowedActions);

        console.log("[Realtime] RL policy selected action:", action, "for state:", session.currentState);

        // Inject action as system message
        ws.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: `[Respond with intent: ${action}]` }],
          },
        }));

        // Trigger response
        ws.send(JSON.stringify({ type: "response.create" }));
      }
      break;

    case "conversation.item.input_audio_transcription.completed":
      const userText = event.transcript || "";
      if (userText.trim()) {
        session.userTranscript = userText;
        session.turnIndex++;

        const userMessage: Message = {
          id: `msg-${Date.now()}-user`,
          role: "user",
          text: userText,
          timestamp: new Date(),
        };
        session.messages.push(userMessage);

        emit("transcript:user", {
          text: userText,
          message: userMessage,
          isFinal: true,
        });

        // Check for policy violations or state transitions
        checkPolicyAndUpdateState(session, userText, io);
      }
      break;

    case "response.created":
      console.log("[Realtime] Response created - agent starting to speak");
      emit("voice:agentSpeaking", { speaking: true });
      session.agentTranscript = "";
      break;

    case "response.audio.delta":
    case "response.output_audio.delta":
      const audioBase64 = event.delta;
      if (audioBase64) {
        emit("audio:delta", { audio: audioBase64 });
      }
      break;

    case "response.audio_transcript.delta":
    case "response.output_audio_transcript.delta":
      const textDelta = event.delta || "";
      session.agentTranscript += textDelta;
      emit("transcript:agentDelta", { delta: textDelta });
      break;

    case "response.audio_transcript.done":
    case "response.output_audio_transcript.done":
      const finalAgentText = event.transcript || session.agentTranscript;
      if (finalAgentText.trim()) {
        const agentMessage: Message = {
          id: `msg-${Date.now()}-agent`,
          role: "agent",
          text: finalAgentText,
          timestamp: new Date(),
        };
        session.messages.push(agentMessage);

        emit("transcript:agent", {
          text: finalAgentText,
          message: agentMessage,
          isFinal: true,
        });
      }
      break;

    case "response.done":
      emit("voice:agentSpeaking", { speaking: false });

      // Build trace for debug panel
      const trace = buildTurnTrace(session);
      session.traces.push(trace);
      emit("trace:update", { trace, state: session.currentState });
      break;

    case "error":
      console.error("[Realtime] API Error:", event.error);
      emit("realtime:error", { error: event.error?.message });
      break;

    default:
      if (!type?.startsWith("rate_limits")) {
        // console.log(`[Realtime] Event: ${type}`);
      }
  }
}

// =============================================================================
// Policy & State Management
// =============================================================================

async function checkPolicyAndUpdateState(
  session: VoiceSession,
  userText: string,
  io: SocketIOServer
): Promise<void> {
  await updateStateFromConversation(session, userText, io);

  // If LLM detected DNC, instruct agent to end call
  if (session.currentState === "DO_NOT_CALL" && session.realtimeWs) {
    const prompt = buildStateTransitionPrompt("DO_NOT_CALL");
    session.realtimeWs.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      })
    );
    session.realtimeWs.send(JSON.stringify({ type: "response.create" }));
  }
}

async function updateStateFromConversation(
  session: VoiceSession,
  userText: string,
  io: SocketIOServer
): Promise<void> {
  const currentState = session.currentState;

  console.log(`[FSM] ========================================`);
  console.log(`[FSM] Current state: ${currentState}`);
  console.log(`[FSM] User text: "${userText}"`);
  console.log(`[FSM] Message history count: ${session.messages.length}`);

  // Get LLM-based state classification
  const llmResult = await classifyStateWithLLM(currentState, userText, session.messages);

  console.log(`[FSM] LLM returned: ${llmResult.nextState}`);
  console.log(`[FSM] LLM confidence: ${(llmResult.confidence * 100).toFixed(0)}%`);
  console.log(`[FSM] LLM reasoning: ${llmResult.reasoning}`);

  // Validate and decide whether to apply transition
  const isValid = isValidTransition(currentState, llmResult.nextState);
  console.log(`[FSM] Valid transition: ${isValid}`);

  const decision = shouldApplyTransition(currentState, llmResult, isValid);

  if (decision.apply) {
    console.log(`[FSM] ✓ Transition: ${currentState} → ${llmResult.nextState}`);
    session.currentState = llmResult.nextState;
    if (!session.stateHistory.includes(llmResult.nextState)) {
      session.stateHistory.push(llmResult.nextState);
    }
    io.to(session.id).emit("state:changed", { state: llmResult.nextState, reason: decision.reason });
  } else {
    console.log(`[FSM] ✗ No transition: ${decision.reason}`);
  }
  console.log(`[FSM] ========================================`);
}

function buildTurnTrace(session: VoiceSession): TurnTrace {
  const policyDecision = policyEngine.evaluate({
    caseData: session.caseData,
    config: session.policyConfig,
    currentState: session.currentState,
  });

  return {
    turnIndex: session.turnIndex,
    userText: session.userTranscript,
    assistantText: session.agentTranscript,
    detectedSignals: [],
    fsmStateBefore: session.stateHistory[session.stateHistory.length - 2] || "OPENING",
    fsmStateAfter: session.currentState,
    policyDecision,
    llmInput: {
      caseId: session.caseData.id,
      language: session.caseData.language,
      state: session.currentState,
      userUtterance: session.userTranscript,
      slots: {},
      allowedIntents: ["PROCEED"],
      prohibitedTopics: session.policyConfig.prohibitedPhrases,
      toolPermissions: [],
      requiredTemplates: [],
    },
    llmOutput: {
      chosenIntent: "PROCEED",
      assistantText: session.agentTranscript,
      toolCalls: [],
      confidence: 0.9,
      tokensUsed: 0,
    },
    validationResult: { passed: true, failures: [], repairsAttempted: 0, fallbackUsed: false },
    latencyMs: 0,
    timestamp: new Date(),
  };
}

// =============================================================================
// Server Setup
// =============================================================================

async function startServer() {
  console.log("Starting server...");
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? "Configured" : "NOT CONFIGURED"}`);

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();
  console.log("Next.js prepared");

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: 1e8,
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    socket.emit("socket:connected", { socketId: socket.id });

    // ==========================================================================
    // Session Rejoin (for HMR reconnects)
    // ==========================================================================

    socket.on("session:rejoin", (data: { sessionId: string }) => {
      console.log(`[Socket] Client ${socket.id} rejoining session ${data.sessionId}`);
      const session = sessions.get(data.sessionId);

      if (session && (session.status === "active" || session.status === "connecting" || session.status === "ringing")) {
        socket.join(session.id);
        console.log(`[Socket] Client ${socket.id} rejoined session ${session.id}, status: ${session.status}`);

        socket.emit("session:rejoined", {
          sessionId: session.id,
          status: session.status,
          state: session.currentState,
          messageCount: session.messages.length,
        });
      } else {
        console.log(`[Socket] Session ${data.sessionId} not found or not active`);
        socket.emit("session:rejoin_failed", { reason: "Session not found or inactive" });
      }
    });

    // ==========================================================================
    // Call Initiation
    // ==========================================================================

    socket.on("call:initiate", async (data: { caseData: CaseData; policyConfig: PolicyConfig; policyId?: string }) => {
      console.log("[Call] Received call:initiate", { caseId: data.caseData?.id, policyId: data.policyId });
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const policyCheck = policyEngine.evaluate({
        caseData: data.caseData,
        config: data.policyConfig,
        currentState: "OPENING",
      });

      console.log("[Call] Policy check result:", { allowed: policyCheck.allowed, reasons: policyCheck.blockedReasons });

      if (!policyCheck.allowed) {
        console.log("[Call] Blocked by policy:", policyCheck.blockedReasons);
        socket.emit("call:blocked", {
          reason: policyCheck.blockedReasons.join(", "),
          riskLevel: policyCheck.riskLevel,
        });
        return;
      }

      // Load RL learner if policyId is provided
      let learner: Learner | null = null;
      if (data.policyId) {
        try {
          const experiment = await db.getExperiment(data.policyId);
          if (experiment && experiment.learner_state) {
            const learnerState = JSON.parse(experiment.learner_state);
            learner = createLearnerFromState({
              type: learnerState.type || "bandit",
              learnerState: learnerState,
            });
            console.log("[Call] Loaded RL learner:", data.policyId, "type:", learnerState.type);
          }
        } catch (err) {
          console.error("[Call] Failed to load RL policy:", err);
        }
      }

      const session: VoiceSession = {
        id: sessionId,
        caseData: data.caseData,
        policyConfig: data.policyConfig,
        messages: [],
        traces: [],
        currentState: "OPENING",
        stateHistory: ["OPENING"],
        turnIndex: 0,
        status: "ringing",
        realtimeWs: null,
        agentTranscript: "",
        userTranscript: "",
        callStartTime: null,
        learner,
      };

      sessions.set(sessionId, session);
      socket.join(sessionId);

      console.log(`[Call] Initiating call for session ${sessionId}`);

      io.to(sessionId).emit("call:ringing", {
        sessionId,
        caseData: data.caseData,
        callerName: data.caseData.creditorName,
        callerPhone: data.caseData.debtorPhone,
      });
    });

    // ==========================================================================
    // Call Answer
    // ==========================================================================

    socket.on("call:answer", (data?: { sessionId?: string }) => {
      console.log("[Call] Received call:answer");
      let session: VoiceSession | undefined;

      for (const [id, s] of sessions) {
        if (s.status === "ringing") {
          session = s;
          break;
        }
      }

      if (!session) {
        console.log("[Call] No ringing session found");
        socket.emit("call:error", { error: "No incoming call to answer" });
        return;
      }

      console.log(`[Call] Answered: ${session.id}`);

      session.status = "connecting";
      session.callStartTime = Date.now();

      io.to(session.id).emit("call:connecting", { sessionId: session.id });

      try {
        console.log("[Call] Creating Realtime API connection...");
        session.realtimeWs = createRealtimeConnection(session, io);

        session.realtimeWs.on("open", () => {
          console.log("[Call] Realtime API connected, marking call as active");
          session!.status = "active";
          io.to(session!.id).emit("call:connected", {
            sessionId: session!.id,
            state: session!.currentState,
          });
        });

        session.realtimeWs.on("error", (err) => {
          console.error("[Call] Realtime WS error:", err);
        });
      } catch (error) {
        console.error("[Call] Failed to connect to Realtime API:", error);
        session.status = "ended";
        io.to(session.id).emit("call:error", { error: "Failed to connect to voice service" });
      }
    });

    // ==========================================================================
    // Call Decline
    // ==========================================================================

    socket.on("call:decline", () => {
      for (const [id, session] of sessions) {
        if (session.status === "ringing") {
          session.status = "declined";
          io.to(session.id).emit("call:declined", { sessionId: id });
          console.log(`[Call] Declined: ${id}`);
          break;
        }
      }
    });

    // ==========================================================================
    // Audio Streaming
    // ==========================================================================

    socket.on("audio:chunk", (data: { sessionId: string; audio: string }) => {
      const session = sessions.get(data.sessionId);

      if (!session || session.status !== "active" || !session.realtimeWs) {
        return;
      }

      session.realtimeWs.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.audio,
        })
      );
    });

    // ==========================================================================
    // Call End
    // ==========================================================================

    socket.on("call:end", (data?: { sessionId?: string }) => {
      console.log("[Call] Received call:end", data);
      let session: VoiceSession | undefined;

      if (data?.sessionId) {
        session = sessions.get(data.sessionId);
      } else {
        for (const [id, s] of sessions) {
          console.log(`[Call] Checking session ${id}: status=${s.status}`);
          if (s.status === "active" || s.status === "ringing") {
            session = s;
            break;
          }
        }
      }

      if (session) {
        console.log(`[Call] Ending session ${session.id}`);
        session.status = "ended";

        if (session.realtimeWs) {
          session.realtimeWs.close();
          session.realtimeWs = null;
        }

        const duration = session.callStartTime
          ? Math.floor((Date.now() - session.callStartTime) / 1000)
          : 0;

        io.to(session.id).emit("call:ended", {
          sessionId: session.id,
          duration,
          messageCount: session.messages.length,
          finalState: session.currentState,
        });

        console.log(`[Call] Ended: ${session.id}, duration: ${duration}s`);
      }
    });

    // ==========================================================================
    // Simulation Start
    // ==========================================================================

    socket.on("simulation:start", async (data: {
      personaId: string;
      policyType: string;
      policyId?: string;        // Load trained policy from database by ID
      learnerFilename?: string; // Legacy: load from JSON file
    }) => {
      console.log("[Simulation] Received simulation:start", data);

      const persona = getPersonaById(data.personaId);
      if (!persona) {
        socket.emit("simulation:error", { error: `Persona not found: ${data.personaId}` });
        return;
      }

      // Load learner if specified
      let learner: Learner | undefined;
      let loadedPolicyId: string | undefined;

      if (data.policyType !== "none") {
        // Option 1: Load from database by policy ID (preferred)
        if (data.policyId) {
          try {
            const experiment = db.getExperiment(data.policyId);
            if (experiment?.learner_state) {
              const learnerState = JSON.parse(experiment.learner_state);
              learner = createLearnerFromState({
                type: experiment.learner_type as "bandit" | "qlearning",
                learnerState,
              });
              loadedPolicyId = data.policyId;
              console.log("[Simulation] Loaded trained policy from database:", data.policyId);
            } else {
              console.warn("[Simulation] Policy not found or has no state:", data.policyId);
            }
          } catch (error) {
            console.error("[Simulation] Failed to load policy from database:", error);
          }
        }
        // Option 2: Load from JSON file (legacy)
        else if (data.learnerFilename) {
          try {
            const resultsDir = path.join(process.cwd(), "rl-results");
            const filePath = path.join(resultsDir, data.learnerFilename);

            // Security check
            if (!filePath.startsWith(resultsDir)) {
              socket.emit("simulation:error", { error: "Invalid learner path" });
              return;
            }

            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, "utf-8");

              if (data.policyType === "bandit") {
                learner = new BanditLearner();
                learner.load(content);
                console.log("[Simulation] Loaded bandit learner from file:", data.learnerFilename);
              } else if (data.policyType === "qlearning") {
                learner = new QLearner();
                learner.load(content);
                console.log("[Simulation] Loaded Q-learning learner from file:", data.learnerFilename);
              }
            }
          } catch (error) {
            console.error("[Simulation] Failed to load learner from file:", error);
          }
        }

        // If no trained policy loaded but policyType specified, create fresh learner
        if (!learner && data.policyType !== "none") {
          learner = createFreshLearner(data.policyType as "bandit" | "qlearning");
          console.log("[Simulation] Created fresh", data.policyType, "learner (untrained)");
        }
      }

      const simulationId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      socket.join(simulationId);

      socket.emit("simulation:starting", {
        simulationId,
        persona: {
          id: persona.id,
          name: persona.name,
          path: persona.path,
        },
        policyType: data.policyType,
        learnerLoaded: !!learner,
      });

      const config: SimulationConfig = {
        personaId: data.personaId,
        policyType: data.policyType as "none" | "bandit" | "qlearning",
      };

      const callbacks: OrchestratorCallbacks = {
        onTranscript: (side, text, isFinal) => {
          io.to(simulationId).emit("simulation:transcript", {
            side,
            text,
            isFinal,
            timestamp: new Date(),
          });
        },
        onAudio: (side, base64Audio) => {
          io.to(simulationId).emit("simulation:audio", {
            side,
            audio: base64Audio,
          });
        },
        onStateChange: (agentState, borrowerPathIndex) => {
          io.to(simulationId).emit("simulation:stateChange", {
            agentState,
            borrowerPathIndex,
          });
        },
        onDecision: (decision) => {
          io.to(simulationId).emit("simulation:decision", {
            turn: decision.turn,
            selectedAction: decision.selectedAction,
            policyDecisionMs: decision.policyDecisionMs,
            availableActions: decision.availableActions,
          });
        },
        onComplete: (result) => {
          io.to(simulationId).emit("simulation:complete", {
            simulationId: result.simulationId,
            completed: result.completed,
            pathCompleted: result.pathCompleted,
            finalState: result.finalState,
            outcome: result.outcome,
            totalTurns: result.totalTurns,
            totalDurationMs: result.totalDurationMs,
          });

          // Save result to rl-results directory in dashboard-compatible format
          try {
            const resultsDir = path.join(process.cwd(), "rl-results");
            if (!fs.existsSync(resultsDir)) {
              fs.mkdirSync(resultsDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `voice-sim-${data.policyType}-${timestamp}.json`;
            const filepath = path.join(resultsDir, filename);

            // Format compatible with RL dashboard
            const dashboardData = {
              // Metadata
              type: "voice-simulation",
              simulationId: result.simulationId,
              persona: {
                id: result.persona.id,
                name: result.persona.name,
                path: result.persona.path,
              },
              policyType: result.policyType,
              trainTimeMs: result.totalDurationMs,
              numEpisodes: 1, // Single simulation = 1 episode

              // Learning curve (single point for this episode)
              learningCurve: [{
                episode: 1,
                trainReturn: result.totalReturn,
              }],

              // Episode data for Episode Explorer
              episodes: [{
                episodeId: result.simulationId,
                persona: result.persona.id,
                outcome: result.outcome,
                totalReturn: result.totalReturn,
                turns: result.totalTurns,
                durationMs: result.totalDurationMs,
                finalState: result.finalState,
                pathCompleted: result.pathCompleted,
                transcript: result.transcript.map((m) => ({
                  role: m.role,
                  text: m.text,
                  timestamp: m.timestamp,
                })),
                decisions: result.decisions.map((d) => ({
                  turn: d.turn,
                  selectedAction: d.selectedAction,
                  availableActions: d.availableActions,
                  policyDecisionMs: d.policyDecisionMs,
                })),
              }],

              // Final metrics
              finalMetrics: {
                avgReturn: result.totalReturn,
                successRate: result.pathCompleted ? 1 : 0,
                avgTurns: result.totalTurns,
                avgDurationMs: result.totalDurationMs,
              },

              // Eval results (voice simulation as single eval)
              evalResults: [{
                episodeId: result.simulationId,
                outcome: result.outcome,
                return: result.totalReturn,
              }],
            };

            fs.writeFileSync(filepath, JSON.stringify(dashboardData, null, 2));
            console.log("[Simulation] Results saved to:", filename);

            // Also save to SQLite database
            try {
              const experimentId = `voice-sim-${result.simulationId}`;
              const episodeId = `${experimentId}-ep-1`;

              db.createExperiment({
                id: experimentId,
                type: "voice-simulation",
                learnerType: result.policyType === "bandit" ? "bandit" : result.policyType === "qlearning" ? "qlearning" : undefined,
                config: { personaId: result.persona.id, policyType: result.policyType },
                finalMetrics: dashboardData.finalMetrics,
                trainTimeMs: result.totalDurationMs,
              });

              db.createEpisode({
                id: episodeId,
                experimentId,
                episodeNum: 1,
                personaId: result.persona.id,
                personaName: result.persona.name,
                persona: result.persona,
                outcome: result.outcome,
                totalReturn: result.totalReturn,
                turns: result.totalTurns,
                durationMs: result.totalDurationMs,
              });

              // Save transcript as turns
              const turns = result.transcript.map((m, idx) => {
                const isAgent = m.role === "agent";
                const prevMsg = idx > 0 ? result.transcript[idx - 1] : null;
                return {
                  episodeId,
                  turnNum: Math.floor(idx / 2) + 1,
                  agentText: isAgent ? m.text : prevMsg?.role === "agent" ? undefined : undefined,
                  borrowerText: !isAgent ? m.text : undefined,
                };
              });

              // Group by turn and save
              const groupedTurns: Map<number, { agentText?: string; borrowerText?: string }> = new Map();
              for (let i = 0; i < result.transcript.length; i++) {
                const m = result.transcript[i];
                const turnNum = Math.floor(i / 2) + 1;
                if (!groupedTurns.has(turnNum)) {
                  groupedTurns.set(turnNum, {});
                }
                const turn = groupedTurns.get(turnNum)!;
                if (m.role === "agent") {
                  turn.agentText = m.text;
                } else {
                  turn.borrowerText = m.text;
                }
              }

              const turnData = Array.from(groupedTurns.entries()).map(([turnNum, data]) => ({
                episodeId,
                turnNum,
                agentText: data.agentText,
                borrowerText: data.borrowerText,
              }));

              db.createTurnsBatch(turnData);
              console.log("[Simulation] Results saved to database");
            } catch (dbError) {
              console.error("[Simulation] Failed to save to database:", dbError);
            }
          } catch (saveError) {
            console.error("[Simulation] Failed to save results:", saveError);
          }

          simulations.delete(simulationId);
        },
        onError: (error) => {
          io.to(simulationId).emit("simulation:error", {
            error: error.message,
          });
          simulations.delete(simulationId);
        },
      };

      try {
        // Note: runSimulation returns a promise that resolves when simulation completes
        // For now we don't await it - it runs in background and emits events
        runSimulation(config, callbacks, learner).catch((err) => {
          console.error("[Simulation] Error:", err);
          io.to(simulationId).emit("simulation:error", { error: err.message });
        });

        socket.emit("simulation:started", { simulationId, learnerLoaded: !!learner });
      } catch (error) {
        console.error("[Simulation] Failed to start:", error);
        socket.emit("simulation:error", {
          error: error instanceof Error ? error.message : "Failed to start simulation",
        });
      }
    });

    // ==========================================================================
    // Simulation Stop
    // ==========================================================================

    socket.on("simulation:stop", (data: { simulationId: string }) => {
      console.log("[Simulation] Received simulation:stop", data);
      const session = simulations.get(data.simulationId);

      if (session) {
        stopSimulation(session);
        simulations.delete(data.simulationId);
        io.to(data.simulationId).emit("simulation:stopped", {
          simulationId: data.simulationId,
        });
      }
    });

    // ==========================================================================
    // Text Message
    // ==========================================================================

    socket.on("message:send", (data: { sessionId: string; text: string }) => {
      const session = sessions.get(data.sessionId);

      if (!session || session.status !== "active" || !session.realtimeWs) {
        socket.emit("message:error", { error: "No active call" });
        return;
      }

      session.realtimeWs.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: data.text }],
          },
        })
      );

      session.realtimeWs.send(JSON.stringify({ type: "response.create" }));

      const userMessage: Message = {
        id: `msg-${Date.now()}-user`,
        role: "user",
        text: data.text,
        timestamp: new Date(),
      };
      session.messages.push(userMessage);
      io.to(session.id).emit("message:received", { message: userMessage });
    });

    // ==========================================================================
    // Disconnect
    // ==========================================================================

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Voice Agent Server with OpenAI Realtime API`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
