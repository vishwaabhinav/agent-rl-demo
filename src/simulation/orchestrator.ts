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
          session.agentSession?.triggerResponse();
        }
      };

      // Create agent session
      session.agentSession = createAgentSession(session, callbacks, () => {
        agentReady = true;
        checkBothReady();
      });

      // Create borrower session
      session.borrowerSession = createBorrowerSession(session, callbacks, () => {
        borrowerReady = true;
        checkBothReady();
      });

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

/**
 * Create agent Realtime session
 */
function createAgentSession(
  session: SimulationSession,
  callbacks: OrchestratorCallbacks,
  onReady: () => void
): RealtimeSessionHandle {
  const config: RealtimeSessionConfig = {
    instructions: buildAgentInstructions(DEMO_CASE, DEFAULT_POLICY_CONFIG),
    voice: "coral",
    turnDetection: {
      type: "semantic_vad",
      eagerness: "medium",
      createResponse: true,
      interruptResponse: true,
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
      // Pipe to borrower
      session.borrowerSession?.sendAudio(audio);
    },
    onAgentSpeechEnd: () => {
      // Agent finished speaking, check state transition
      handleAgentTurnComplete(session, callbacks);
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
  onReady: () => void
): RealtimeSessionHandle {
  const config: RealtimeSessionConfig = {
    instructions: buildBorrowerInstructions(session.persona),
    voice: session.persona.voice,
    turnDetection: {
      type: "semantic_vad",
      eagerness: session.persona.behavior.interruptEagerness,
      createResponse: true,
      interruptResponse: true,
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
      // Pipe to agent
      session.agentSession?.sendAudio(audio);
    },
    onAgentSpeechEnd: () => {
      // Borrower finished speaking, prepare for agent response
      handleBorrowerTurnComplete(session, callbacks);
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
  callbacks: OrchestratorCallbacks
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
  }
}

/**
 * Handle borrower turn completion - this is where RL decision injection happens
 */
async function handleBorrowerTurnComplete(
  session: SimulationSession,
  callbacks: OrchestratorCallbacks
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
    session.agentSession?.triggerResponse();
  }
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
