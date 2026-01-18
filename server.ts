import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import next from "next";
import WebSocket from "ws";
import OpenAI from "openai";
import type {
  CaseData,
  FSMState,
  Message,
  PolicyConfig,
  TurnTrace,
} from "./src/lib/types";
import { policyEngine } from "./src/lib/engine/policy";

// OpenAI client for state classification
const openai = new OpenAI();

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

// =============================================================================
// Session Types
// =============================================================================

type CallStatus = "idle" | "ringing" | "connecting" | "active" | "ended" | "declined";

interface VoiceSession {
  id: string;
  caseData: CaseData;
  policyConfig: PolicyConfig;
  messages: Message[];
  traces: TurnTrace[];
  currentState: FSMState;
  stateHistory: FSMState[];
  turnIndex: number;
  status: CallStatus;
  realtimeWs: WebSocket | null;
  agentTranscript: string;
  userTranscript: string;
  callStartTime: number | null;
}

const sessions = new Map<string, VoiceSession>();

// =============================================================================
// LLM State Classification
// =============================================================================

const VALID_STATES: FSMState[] = [
  "OPENING",
  "DISCLOSURE",
  "IDENTITY_VERIFICATION",
  "CONSENT_RECORDING",
  "DEBT_CONTEXT",
  "NEGOTIATION",
  "PAYMENT_SETUP",
  "WRAPUP",
  "CALLBACK_SCHEDULED",
  "END_CALL",
  "WRONG_PARTY_FLOW",
  "DISPUTE_FLOW",
  "DO_NOT_CALL",
  "ESCALATE_HUMAN",
];

// Main flow states in order - transitions should be sequential
const MAIN_FLOW_ORDER: FSMState[] = [
  "OPENING",
  "DISCLOSURE",
  "IDENTITY_VERIFICATION",
  "CONSENT_RECORDING",
  "DEBT_CONTEXT",
  "NEGOTIATION",
  "PAYMENT_SETUP",
  "WRAPUP",
  "END_CALL",
];

// Special/branch states that can be reached from specific states
const SPECIAL_STATES: FSMState[] = [
  "WRONG_PARTY_FLOW",
  "DISPUTE_FLOW",
  "DO_NOT_CALL",
  "ESCALATE_HUMAN",
  "CALLBACK_SCHEDULED", // Can be reached from NEGOTIATION when no payment but callback agreed
];

// Check if a transition is valid (only allow adjacent states or special states)
function isValidTransition(from: FSMState, to: FSMState): boolean {
  // Special states can be reached from anywhere
  if (SPECIAL_STATES.includes(to)) {
    return true;
  }

  // Same state is always valid
  if (from === to) {
    return true;
  }

  const fromIdx = MAIN_FLOW_ORDER.indexOf(from);
  const toIdx = MAIN_FLOW_ORDER.indexOf(to);

  // If either state isn't in main flow, allow it
  if (fromIdx === -1 || toIdx === -1) {
    return true;
  }

  // Only allow moving forward by 1 step in the main flow
  return toIdx === fromIdx + 1;
}

async function classifyStateWithLLM(
  currentState: FSMState,
  userText: string,
  recentMessages: Message[]
): Promise<{ nextState: FSMState; confidence: number; reasoning: string }> {
  try {
    const conversationContext = recentMessages
      .slice(-6) // Last 6 messages for context
      .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `You are analyzing a debt collection call to determine the current conversation state.

Valid states (in typical order):
1. OPENING - Initial greeting, asking to speak with debtor
2. DISCLOSURE - Agent identifies themselves and states this is a debt collection call
3. IDENTITY_VERIFICATION - Verifying debtor's identity (SSN, DOB)
4. CONSENT_RECORDING - Asking for recording consent
5. DEBT_CONTEXT - Explaining the debt amount and creditor
6. NEGOTIATION - Discussing payment options and plans
7. PAYMENT_SETUP - Arranging specific payment details (amount, date, method)
8. WRAPUP - Summarizing completed payment arrangement, providing reference number
9. END_CALL - Call is ending

Special/branch states:
- CALLBACK_SCHEDULED - Call ending WITHOUT payment arranged, but with a callback/follow-up scheduled (e.g., "I'll check with my team and call you back", "Call me tomorrow")
- WRONG_PARTY_FLOW - User says wrong number or denies being the debtor
- DISPUTE_FLOW - User disputes the debt
- DO_NOT_CALL - User requests no more calls
- ESCALATE_HUMAN - User demands to speak with a human/supervisor

IMPORTANT: Use CALLBACK_SCHEDULED (not WRAPUP) when:
- A callback time is agreed but NO payment has been arranged
- Agent needs to check with team/supervisor before finalizing
- User asks to be called back later without committing to payment

Respond with JSON only: {"nextState": "STATE_NAME", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`,
        },
        {
          role: "user",
          content: `Current state: ${currentState}

Recent conversation:
${conversationContext}

Latest user message: "${userText}"

What state should the conversation be in now?`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    // Validate the state
    if (!VALID_STATES.includes(result.nextState)) {
      console.warn(`[LLM] Invalid state returned: ${result.nextState}, keeping ${currentState}`);
      return { nextState: currentState, confidence: 0, reasoning: "Invalid state returned" };
    }

    return {
      nextState: result.nextState as FSMState,
      confidence: result.confidence || 0.5,
      reasoning: result.reasoning || "",
    };
  } catch (error) {
    console.error("[LLM] State classification error:", error);
    return { nextState: currentState, confidence: 0, reasoning: "Error in classification" };
  }
}

// =============================================================================
// OpenAI Realtime API Connection
// =============================================================================

function createRealtimeConnection(
  session: VoiceSession,
  io: SocketIOServer
): WebSocket {
  const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";

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

    // Configure the session with debt collection agent persona
    const instructions = buildAgentInstructions(session.caseData, session.policyConfig);

    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions,
          voice: "coral", // Professional, clear voice
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "en",
          },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "medium",
            create_response: true,
            interrupt_response: true,
          },
        },
      })
    );

  });

  ws.on("message", (data: WebSocket.Data) => {
    try {
      const event = JSON.parse(data.toString());
      // Log all event types for debugging (except high-frequency audio)
      if (!event.type?.includes('audio.delta')) {
        console.log(`[Realtime] Event: ${event.type}`);
      }
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
      // Now that session is configured, trigger the greeting
      if (session.realtimeWs && session.realtimeWs.readyState === WebSocket.OPEN) {
        session.realtimeWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "[SYSTEM: The call has been answered. Deliver your opening greeting to verify you're speaking with the right person.]",
                },
              ],
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
      // Stream audio to client
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
      // Ignore rate_limits and other routine events
      if (!type?.startsWith("rate_limits")) {
        // console.log(`[Realtime] Event: ${type}`);
      }
  }
}

// =============================================================================
// Agent Instructions Builder
// =============================================================================

function buildAgentInstructions(caseData: CaseData, policyConfig: PolicyConfig): string {
  // Agent identity
  const agentName = "Sarah Mitchell";
  const agentId = "SM-4721";

  return `You are ${agentName}, a professional debt collection agent for ${caseData.creditorName}. Your agent ID is ${agentId}. You are calling ${caseData.debtorName} regarding an outstanding balance.

## Your Identity
- Name: ${agentName}
- Agent ID: ${agentId}
- Company: ${caseData.creditorName}

## Your Goal
Professionally and compliantly work toward resolving the debt of $${caseData.amountDue.toLocaleString()} that is ${caseData.daysPastDue} days past due.

## Call Flow (Follow this sequence)
1. OPENING: Greet and verify you're speaking with ${caseData.debtorName}
2. DISCLOSURE: State your name (${agentName}), company, and that this is an attempt to collect a debt
3. IDENTITY VERIFICATION: Verify identity using last 4 of SSN or DOB
4. RECORDING CONSENT: Ask for consent to record (required in ${caseData.jurisdiction})
5. DEBT CONTEXT: Explain the debt amount, creditor, and current status
6. NEGOTIATION: Discuss payment options, offer payment plans if needed
7. PAYMENT SETUP: Arrange payment method and date
8. WRAP UP: Summarize agreement, provide reference number

## Compliance Rules (MUST FOLLOW)
- NEVER threaten or use abusive language
- If they say "stop calling" or "do not contact", immediately end the call politely
- If they dispute the debt, note it and explain dispute process
- If they say "wrong number", apologize and end call
- DO NOT discuss debt with anyone other than the debtor
- Respect call time restrictions (${policyConfig.callWindowStart}:00 - ${policyConfig.callWindowEnd}:00 local time)

## Voice Style
- Professional but warm tone
- Speak clearly at moderate pace
- Be empathetic but firm
- Use the debtor's name occasionally
- Keep responses concise (1-2 sentences typical)

## Current Context
- Debtor: ${caseData.debtorName}
- Phone: ${caseData.debtorPhone}
- Amount Due: $${caseData.amountDue.toLocaleString()}
- Days Past Due: ${caseData.daysPastDue}
- Jurisdiction: ${caseData.jurisdiction}
- Previous Attempts Today: ${caseData.attemptCountToday}
- Total Attempts: ${caseData.attemptCountTotal}

Begin with a professional greeting when the call connects.`;
}

// =============================================================================
// Policy & State Management
// =============================================================================

async function checkPolicyAndUpdateState(session: VoiceSession, userText: string, io: SocketIOServer): Promise<void> {
  const lowerText = userText.toLowerCase();
  const emit = (eventName: string, data: any) => io.to(session.id).emit(eventName, data);

  // Check for DNC signals (immediate, no LLM needed)
  if (/stop calling|do not contact|remove my number|don't call/i.test(lowerText)) {
    session.currentState = "DO_NOT_CALL";
    emit("state:changed", { state: "DO_NOT_CALL", reason: "DNC request detected" });

    // Instruct agent to end call
    if (session.realtimeWs) {
      session.realtimeWs.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: "[SYSTEM: The debtor has requested Do Not Call. Acknowledge their request politely and end the call immediately.]",
              },
            ],
          },
        })
      );
      session.realtimeWs.send(JSON.stringify({ type: "response.create" }));
    }
    return;
  }

  // Check for dispute signals (immediate, no LLM needed)
  if (/dispute|not my debt|wrong amount|i don't owe|never had/i.test(lowerText)) {
    session.currentState = "DISPUTE_FLOW";
    emit("state:changed", { state: "DISPUTE_FLOW", reason: "Dispute detected" });
    return;
  }

  // Check for wrong party (immediate, no LLM needed)
  if (/wrong number|not .+name|never heard of|who\?/i.test(lowerText)) {
    session.currentState = "WRONG_PARTY_FLOW";
    emit("state:changed", { state: "WRONG_PARTY_FLOW", reason: "Wrong party detected" });
    return;
  }

  // Check for callback request (when in NEGOTIATION and no payment arranged)
  if (session.currentState === "NEGOTIATION" &&
      /call.*(back|later|tomorrow|next week)|call me (in|at)|get back to (me|you)|check with.*(team|supervisor|manager)|let me know|I('ll| will) (call|get back|reach out)/i.test(lowerText)) {
    session.currentState = "CALLBACK_SCHEDULED";
    emit("state:changed", { state: "CALLBACK_SCHEDULED", reason: "Callback scheduled without payment" });
    return;
  }

  // Normal state progression - use pattern + LLM triangulation
  await updateStateFromConversation(session, userText, io);
}

function getPatternMatchState(currentState: FSMState, userText: string): FSMState {
  const text = userText.toLowerCase();
  let newState = currentState;

  switch (currentState) {
    case "OPENING":
      if (/yes|speaking|this is|that's me|hello|hi|guess|yeah/i.test(text)) {
        newState = "DISCLOSURE";
      }
      break;

    case "DISCLOSURE":
      if (text.length > 0) {
        newState = "IDENTITY_VERIFICATION";
      }
      break;

    case "IDENTITY_VERIFICATION":
      if (/\d{4}|correct|yes|yeah|confirmed|okay|sure|go ahead|thank|speaking/i.test(text)) {
        newState = "CONSENT_RECORDING";
      }
      break;

    case "CONSENT_RECORDING":
      if (/yes|yeah|okay|fine|go ahead|consent|agree|sure|please/i.test(text)) {
        newState = "DEBT_CONTEXT";
      } else if (/no|don't|refuse|decline/i.test(text)) {
        newState = "DEBT_CONTEXT";
      }
      break;

    case "DEBT_CONTEXT":
      if (text.length > 0) {
        newState = "NEGOTIATION";
      }
      break;

    case "NEGOTIATION":
      if (/pay|plan|agree|set up|when|how|sound|good|thousand|hundred|dollar|\d+/i.test(text)) {
        newState = "PAYMENT_SETUP";
      }
      break;

    case "PAYMENT_SETUP":
      if (/confirm|done|yes|yeah|okay|sounds good|next|month|card|transfer|fifth|\d+|credit/i.test(text)) {
        newState = "WRAPUP";
      }
      break;

    case "WRAPUP":
      if (text.length > 0) {
        newState = "END_CALL";
      }
      break;
  }

  return newState;
}

async function updateStateFromConversation(
  session: VoiceSession,
  userText: string,
  io: SocketIOServer
): Promise<void> {
  const currentState = session.currentState;

  console.log(`[FSM] Current: ${currentState}, user: "${userText.substring(0, 50)}..."`);

  // Get pattern-based prediction
  const patternState = getPatternMatchState(currentState, userText);

  // Get LLM-based prediction (async)
  const llmResult = await classifyStateWithLLM(currentState, userText, session.messages);

  console.log(`[FSM] Pattern: ${patternState}, LLM: ${llmResult.nextState} (${(llmResult.confidence * 100).toFixed(0)}% - ${llmResult.reasoning})`);

  // Validate that proposed states are valid transitions
  const patternValid = isValidTransition(currentState, patternState);
  const llmValid = isValidTransition(currentState, llmResult.nextState);

  console.log(`[FSM] Valid transitions - Pattern: ${patternValid}, LLM: ${llmValid}`);

  // Triangulation logic with transition validation
  let finalState: FSMState;
  let reason: string;

  // Check if pattern detected forward progress in main flow
  const patternMovesForward = patternState !== currentState && patternValid;
  const llmMovesForward = llmResult.nextState !== currentState && llmValid;

  if (patternState === llmResult.nextState && patternValid) {
    // Both agree and it's a valid transition - highest confidence
    finalState = patternState;
    reason = `Both pattern and LLM agree`;
  } else if (patternMovesForward) {
    // Pattern detected forward progress - trust it for main flow
    // (Pattern is more reliable for sequential state progression)
    finalState = patternState;
    reason = `Pattern forward (${patternState})`;
  } else if (llmResult.confidence >= 0.8 && llmValid && SPECIAL_STATES.includes(llmResult.nextState)) {
    // LLM confidently detected a special state (DNC, dispute, etc.) - trust it
    finalState = llmResult.nextState;
    reason = `LLM special state (${(llmResult.confidence * 100).toFixed(0)}%): ${llmResult.reasoning}`;
  } else if (llmMovesForward && llmResult.confidence >= 0.85) {
    // LLM very confident about forward progress
    finalState = llmResult.nextState;
    reason = `LLM forward (${(llmResult.confidence * 100).toFixed(0)}%): ${llmResult.reasoning}`;
  } else {
    // No confident change detected
    finalState = currentState;
    reason = "No change detected";
  }

  if (finalState !== currentState) {
    console.log(`[FSM] Transition: ${currentState} → ${finalState} (${reason})`);
    session.currentState = finalState;
    if (!session.stateHistory.includes(finalState)) {
      session.stateHistory.push(finalState);
    }
    io.to(session.id).emit("state:changed", { state: finalState, reason });
  }
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
    maxHttpBufferSize: 1e8, // 100MB for audio chunks
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Store socket reference globally for components
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

        // Send current state to the rejoined client
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
    // Call Initiation (Operator triggers call from Control Panel)
    // ==========================================================================

    socket.on("call:initiate", (data: { caseData: CaseData; policyConfig: PolicyConfig }) => {
      console.log("[Call] Received call:initiate", { caseId: data.caseData?.id });
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Check policy first
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
      };

      sessions.set(sessionId, session);
      socket.join(sessionId);

      console.log(`[Call] Initiating call for session ${sessionId}`);

      // Emit ringing state to trigger receiver UI (use room so reconnected sockets get it)
      io.to(sessionId).emit("call:ringing", {
        sessionId,
        caseData: data.caseData,
        callerName: data.caseData.creditorName,
        callerPhone: data.caseData.debtorPhone,
      });
    });

    // ==========================================================================
    // Call Answer (User answers from Receiver UI)
    // ==========================================================================

    socket.on("call:answer", (data?: { sessionId?: string }) => {
      console.log("[Call] Received call:answer");
      // Find active ringing session for this socket
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

      // Connect to OpenAI Realtime API
      try {
        console.log("[Call] Creating Realtime API connection...");
        session.realtimeWs = createRealtimeConnection(session, io);

        // Wait for connection before marking as active
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
    // Audio Streaming (Browser → Server → OpenAI)
    // ==========================================================================

    socket.on("audio:chunk", (data: { sessionId: string; audio: string }) => {
      const session = sessions.get(data.sessionId);

      if (!session || session.status !== "active" || !session.realtimeWs) {
        return;
      }

      // Forward audio to OpenAI Realtime API
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
        // Find any active session
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

        // Close Realtime connection
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
    // Text Message (for testing / hybrid mode)
    // ==========================================================================

    socket.on("message:send", (data: { sessionId: string; text: string }) => {
      const session = sessions.get(data.sessionId);

      if (!session || session.status !== "active" || !session.realtimeWs) {
        socket.emit("message:error", { error: "No active call" });
        return;
      }

      // Send text to Realtime API
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

      // Add to messages
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
      // Don't close sessions on disconnect - HMR causes reconnects
      // Sessions will be cleaned up when explicitly ended or timed out
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
