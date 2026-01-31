/**
 * Simulation Orchestrator
 *
 * Manages voice-to-voice simulation between agent and borrower Realtime sessions.
 */

import type { FSMState, Message, CaseData } from "../lib/types";
import type { RealtimeSessionHandle, RealtimeSessionConfig } from "../lib/voice/types";
import { createRealtimeSession } from "../lib/voice/realtime";
import { buildAgentInstructions } from "../lib/voice/prompts";
import { isValidTransition, classifyStateWithLLM } from "../lib/voice";
import { extractState, type SessionContext } from "../rl/environment/state-extractor";
import type { RLState, Learner, RLAction } from "../rl/types";
import type {
  SimulationSession,
  SimulationResult,
  SimulationConfig,
  VoicePersona,
  DecisionRecord,
} from "./types";
import { getPersonaById } from "./personas";
import {
  initBorrowerFSM,
  checkTransition,
  advanceFSM,
  isPathComplete,
} from "./borrower-fsm";
import { buildBorrowerInstructions, buildBorrowerStatePrompt } from "./borrower-prompts";

// Unified agent (for future migration)
import { UnifiedAgent } from "../lib/agent";
import type { AgentConfig } from "../lib/agent/types";

// Demo case for simulation
const DEMO_CASE: CaseData = {
  id: "sim-case-001",
  debtorName: "John Smith",
  debtorPhone: "+1-555-0100",
  creditorName: "First National Bank",
  amountDue: 2450.0,
  daysPastDue: 45,
  jurisdiction: "US-CA",
  timezone: "America/Los_Angeles",
  language: "en",
  dnc: false,
  disputed: false,
  wrongParty: false,
  recordingConsent: null,
  identityVerified: null,
  attemptCountToday: 0,
  attemptCountTotal: 2,
};

const DEFAULT_POLICY_CONFIG = {
  jurisdiction: "US-CA",
  callWindowStart: "08:00",
  callWindowEnd: "21:00",
  maxAttemptsPerDay: 3,
  maxAttemptsTotal: 10,
  prohibitedPhrases: [],
  requireRecordingConsent: true,
};

export interface OrchestratorCallbacks {
  onTranscript?: (side: "agent" | "borrower", text: string, isFinal: boolean) => void;
  onAudio?: (side: "agent" | "borrower", base64Audio: string) => void;
  onStateChange?: (agentState: FSMState, borrowerPathIndex: number) => void;
  onDecision?: (decision: DecisionRecord) => void;
  onComplete?: (result: SimulationResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Create and run a simulation
 */
export async function runSimulation(
  config: SimulationConfig,
  callbacks: OrchestratorCallbacks,
  learner?: Learner
): Promise<SimulationResult> {
  const persona = getPersonaById(config.personaId);
  if (!persona) {
    throw new Error(`Persona not found: ${config.personaId}`);
  }

  // Initialize session
  const session = initSession(persona, config, learner);

  // Turn-taking state - shared between both sessions
  const turnState: TurnState = {
    currentSpeaker: "none",
    agentAudioBuffer: [],
    borrowerAudioBuffer: [],
  };

  return new Promise((resolve, reject) => {
    try {
      // Track readiness
      let agentReady = false;
      let borrowerReady = false;

      const checkBothReady = () => {
        if (agentReady && borrowerReady) {
          session.status = "active";
          session.startTime = Date.now();
          console.log("[Orchestrator] Both sessions ready, starting simulation");
          // Agent will start speaking first with greeting
          turnState.currentSpeaker = "agent";
          session.agentSession?.triggerResponse();
        }
      };

      // Create agent session
      session.agentSession = createAgentSession(session, callbacks, () => {
        agentReady = true;
        checkBothReady();
      }, turnState);

      // Create borrower session
      session.borrowerSession = createBorrowerSession(session, callbacks, () => {
        borrowerReady = true;
        checkBothReady();
      }, turnState);

      // Set up completion check
      const checkCompletion = () => {
        if (session.status === "completed" || session.status === "error") {
          const result = buildResult(session);
          callbacks.onComplete?.(result);
          resolve(result);
        }
      };

      // Store completion checker for later use
      (session as any)._checkCompletion = checkCompletion;

    } catch (error) {
      session.status = "error";
      session.error = error instanceof Error ? error.message : String(error);
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      reject(error);
    }
  });
}

/**
 * Initialize simulation session
 */
function initSession(
  persona: VoicePersona,
  config: SimulationConfig,
  learner?: Learner
): SimulationSession {
  return {
    id: `sim-${Date.now()}`,
    simulationId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    persona,
    agentSession: null,
    borrowerSession: null,
    borrowerFSM: initBorrowerFSM(persona),
    agentState: "OPENING",
    messages: [],
    currentState: "OPENING",
    stateHistory: ["OPENING"],
    turnIndex: 0,
    agentTranscript: "",
    userTranscript: "",
    rlState: null,
    learner: learner || null,
    policyType: config.policyType,
    decisions: [],
    turnTimings: [],
    status: "idle",
    startTime: null,
    endTime: null,
    error: null,
  };
}

// Turn-taking state
interface TurnState {
  currentSpeaker: "agent" | "borrower" | "none";
  agentAudioBuffer: string[];
  borrowerAudioBuffer: string[];
}

/**
 * Create agent Realtime session
 */
function createAgentSession(
  session: SimulationSession,
  callbacks: OrchestratorCallbacks,
  onReady: () => void,
  turnState: TurnState
): RealtimeSessionHandle {
  const config: RealtimeSessionConfig = {
    instructions: buildAgentInstructions(DEMO_CASE, DEFAULT_POLICY_CONFIG),
    voice: "coral",
    // Disable auto-response - we manage turns manually
    turnDetection: {
      type: "semantic_vad",
      eagerness: "medium",
      createResponse: false,  // Manual turn management
      interruptResponse: false,
    },
  };

  return createRealtimeSession(config, {
    onReady: () => {
      console.log("[Orchestrator] Agent session ready");
      onReady();
    },
    onAgentTranscript: (text, isFinal) => {
      if (isFinal) {
        session.agentTranscript = text;
        const msg: Message = {
          id: `msg-${Date.now()}-agent`,
          role: "agent",
          text,
          timestamp: new Date(),
        };
        session.messages.push(msg);
      }
      callbacks.onTranscript?.("agent", text, isFinal);
    },
    onAudioDelta: (audio) => {
      callbacks.onAudio?.("agent", audio);
      // Buffer audio for borrower (don't pipe continuously)
      turnState.agentAudioBuffer.push(audio);
    },
    onAgentSpeechEnd: () => {
      console.log("[Orchestrator] Agent finished speaking, buffered chunks:", turnState.agentAudioBuffer.length);
      turnState.currentSpeaker = "none";
      // Agent finished speaking, send buffered audio to borrower and trigger response
      handleAgentTurnComplete(session, callbacks, turnState);
    },
    onError: (err) => {
      session.status = "error";
      session.error = err.message;
      callbacks.onError?.(err);
    },
  });
}

/**
 * Create borrower Realtime session
 */
function createBorrowerSession(
  session: SimulationSession,
  callbacks: OrchestratorCallbacks,
  onReady: () => void,
  turnState: TurnState
): RealtimeSessionHandle {
  const config: RealtimeSessionConfig = {
    instructions: buildBorrowerInstructions(session.persona),
    voice: session.persona.voice,
    // Disable auto-response - we manage turns manually
    turnDetection: {
      type: "semantic_vad",
      eagerness: session.persona.behavior.interruptEagerness,
      createResponse: false,  // Manual turn management
      interruptResponse: false,
    },
  };

  return createRealtimeSession(config, {
    onReady: () => {
      console.log("[Orchestrator] Borrower session ready");
      // Inject initial state prompt
      const statePrompt = buildBorrowerStatePrompt(session.borrowerFSM);
      session.borrowerSession?.injectSystemMessage(statePrompt);
      onReady();
    },
    onAgentTranscript: (text, isFinal) => {
      // Note: borrower's "agent" output is the borrower speaking
      if (isFinal) {
        session.userTranscript = text;
        const msg: Message = {
          id: `msg-${Date.now()}-borrower`,
          role: "user",
          text,
          timestamp: new Date(),
        };
        session.messages.push(msg);
      }
      callbacks.onTranscript?.("borrower", text, isFinal);
    },
    onAudioDelta: (audio) => {
      callbacks.onAudio?.("borrower", audio);
      // Buffer audio for agent (don't pipe continuously)
      turnState.borrowerAudioBuffer.push(audio);
    },
    onAgentSpeechEnd: () => {
      console.log("[Orchestrator] Borrower finished speaking, buffered chunks:", turnState.borrowerAudioBuffer.length);
      turnState.currentSpeaker = "none";
      // Borrower finished speaking, send buffered audio to agent and trigger response
      handleBorrowerTurnComplete(session, callbacks, turnState);
    },
    onError: (err) => {
      session.status = "error";
      session.error = err.message;
      callbacks.onError?.(err);
    },
  });
}

/**
 * Handle agent turn completion
 */
async function handleAgentTurnComplete(
  session: SimulationSession,
  callbacks: OrchestratorCallbacks,
  turnState: TurnState
): Promise<void> {
  // Classify state from conversation
  const llmResult = await classifyStateWithLLM(
    session.agentState,
    session.userTranscript,
    session.messages
  );

  if (isValidTransition(session.agentState, llmResult.nextState) && llmResult.confidence >= 0.5) {
    session.agentState = llmResult.nextState;
    session.currentState = llmResult.nextState;
    if (!session.stateHistory.includes(llmResult.nextState)) {
      session.stateHistory.push(llmResult.nextState);
    }

    // Check borrower FSM
    const transition = checkTransition(session.borrowerFSM, llmResult.nextState);

    if (transition.shouldAdvance) {
      session.borrowerFSM = advanceFSM(session.borrowerFSM);
      // Inject new state prompt to borrower
      const statePrompt = buildBorrowerStatePrompt(session.borrowerFSM);
      session.borrowerSession?.injectSystemMessage(statePrompt);
    } else if (transition.error) {
      console.warn(`[Orchestrator] Borrower FSM drift: ${transition.error}`);
    }

    callbacks.onStateChange?.(session.agentState, session.borrowerFSM.pathIndex);
  }

  // Check for completion
  if (session.agentState === "END_CALL" || isPathComplete(session.borrowerFSM)) {
    session.status = "completed";
    session.endTime = Date.now();
    session.agentSession?.close();
    session.borrowerSession?.close();
    (session as any)._checkCompletion?.();
    return;
  }

  // Send buffered agent audio to borrower all at once
  console.log("[Orchestrator] Sending", turnState.agentAudioBuffer.length, "audio chunks to borrower");
  for (const audio of turnState.agentAudioBuffer) {
    session.borrowerSession?.sendAudio(audio);
  }
  turnState.agentAudioBuffer = []; // Clear buffer

  // Now trigger borrower to respond
  console.log("[Orchestrator] Triggering borrower response");
  turnState.currentSpeaker = "borrower";
  session.borrowerSession?.commitAudioAndRespond();
}

/**
 * Handle borrower turn completion - this is where RL decision injection happens
 */
async function handleBorrowerTurnComplete(
  session: SimulationSession,
  callbacks: OrchestratorCallbacks,
  turnState: TurnState
): Promise<void> {
  session.turnIndex++;

  // Build session context for state extraction
  const sessionContext: SessionContext = {
    fsmContext: {
      currentState: session.agentState,
      stateHistory: session.stateHistory,
      slots: {
        identity_verified: session.stateHistory.includes("DEBT_CONTEXT"),
        disclosure_complete: session.stateHistory.includes("DEBT_CONTEXT"),
      },
    },
    caseData: DEMO_CASE,
    messages: session.messages,
    signalHistory: [],
    actionHistory: [],
    turnCount: session.turnIndex,
  };

  // Extract RL state
  const rlState = extractState(sessionContext);
  session.rlState = rlState;

  // If we have a learner, inject decision
  if (session.learner && session.policyType !== "none") {
    const decisionStart = Date.now();

    // Get allowed actions for current state (simplified)
    const allowedActions: RLAction[] = ["PROCEED", "EMPATHIZE", "OFFER_PLAN", "ASK_CLARIFY"];

    const action = session.learner.selectAction(rlState, allowedActions);
    const decisionMs = Date.now() - decisionStart;

    const decision: DecisionRecord = {
      turn: session.turnIndex,
      timestamp: new Date(),
      rlState,
      availableActions: allowedActions,
      selectedAction: action,
      policyDecisionMs: decisionMs,
      injectedPrompt: `[Respond with intent: ${action}]`,
    };

    session.decisions.push(decision);
    callbacks.onDecision?.(decision);

    // Inject decision to agent
    session.agentSession?.injectSystemMessage(decision.injectedPrompt);
  }

  // Send buffered borrower audio to agent all at once
  console.log("[Orchestrator] Sending", turnState.borrowerAudioBuffer.length, "audio chunks to agent");
  for (const audio of turnState.borrowerAudioBuffer) {
    session.agentSession?.sendAudio(audio);
  }
  turnState.borrowerAudioBuffer = []; // Clear buffer

  // Now trigger agent to respond
  console.log("[Orchestrator] Triggering agent response");
  turnState.currentSpeaker = "agent";
  session.agentSession?.commitAudioAndRespond();
}

/**
 * Build simulation result
 */
function buildResult(session: SimulationSession): SimulationResult {
  const totalDuration = session.endTime && session.startTime
    ? session.endTime - session.startTime
    : 0;

  return {
    simulationId: session.simulationId,
    persona: session.persona,
    policyType: session.policyType,
    completed: session.status === "completed",
    pathCompleted: isPathComplete(session.borrowerFSM),
    finalState: session.agentState,
    outcome: determineOutcome(session),
    totalTurns: session.turnIndex,
    totalDurationMs: totalDuration,
    avgTurnDurationMs: session.turnIndex > 0 ? totalDuration / session.turnIndex : 0,
    transcript: session.messages,
    decisions: session.decisions,
    turnTimings: session.turnTimings,
    totalReturn: 0, // Would compute from reward calculator
  };
}

/**
 * Determine conversation outcome
 */
function determineOutcome(session: SimulationSession): string {
  const finalState = session.agentState;

  switch (finalState) {
    case "END_CALL":
      if (session.stateHistory.includes("PAYMENT_SETUP")) {
        return "PAYMENT_SECURED";
      }
      if (session.stateHistory.includes("CALLBACK_SCHEDULED")) {
        return "CALLBACK_SCHEDULED";
      }
      return "CONVERSATION_ENDED";
    case "DO_NOT_CALL":
      return "DNC_REQUESTED";
    case "WRONG_PARTY_FLOW":
      return "WRONG_PARTY";
    case "DISPUTE_FLOW":
      return "DISPUTE";
    case "ESCALATE_HUMAN":
      return "ESCALATED";
    default:
      return "INCOMPLETE";
  }
}

/**
 * Stop a running simulation
 */
export function stopSimulation(session: SimulationSession): void {
  session.status = "completed";
  session.endTime = Date.now();
  session.agentSession?.close();
  session.borrowerSession?.close();
}
