/**
 * Types for voice-to-voice simulation
 */

import type { FSMState, Message } from "../lib/types";
import type { BaseVoiceSession, RealtimeSessionHandle } from "../lib/voice/types";
import type { RLState, Learner } from "../rl/types";

/**
 * Voice persona with explicit FSM path
 */
export interface VoicePersona {
  id: string;
  name: string;
  description: string;

  /** Explicit path through FSM states */
  path: FSMState[];

  /** OpenAI voice selection */
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

  /** Behavioral parameters */
  behavior: {
    interruptEagerness: "low" | "medium" | "high";
    responseLength: "terse" | "normal" | "verbose";
    emotionalTone: "calm" | "frustrated" | "anxious" | "hostile";
    complianceLevel: number; // 0-1
  };

  /** State-specific response hints */
  stateHints: Partial<Record<FSMState, string>>;
}

/**
 * Borrower FSM state for path enforcement
 */
export interface BorrowerFSMState {
  persona: VoicePersona;
  pathIndex: number;
  currentState: FSMState;
  expectedNextState: FSMState | null;
  attemptsAtCurrentState: number;
  maxAttemptsPerState: number;
}

/**
 * Decision record for RL training
 */
export interface DecisionRecord {
  turn: number;
  timestamp: Date;
  rlState: RLState;
  availableActions: string[];
  selectedAction: string;
  policyDecisionMs: number;
  injectedPrompt: string;
}

/**
 * Turn timing for analysis
 */
export interface TurnTiming {
  turn: number;
  agentSpeakMs: number;
  borrowerSpeakMs: number;
  policyDecisionMs: number;
  silenceGapMs: number;
}

/**
 * Simulation session state
 */
export interface SimulationSession extends BaseVoiceSession {
  /** Unique simulation ID */
  simulationId: string;

  /** Persona being simulated */
  persona: VoicePersona;

  /** Realtime session handles */
  agentSession: RealtimeSessionHandle | null;
  borrowerSession: RealtimeSessionHandle | null;

  /** Borrower FSM state */
  borrowerFSM: BorrowerFSMState;

  /** Agent FSM state (current conversation state) */
  agentState: FSMState;

  /** RL integration */
  rlState: RLState | null;
  learner: Learner | null;
  policyType: "none" | "bandit" | "qlearning";

  /** Captured data */
  decisions: DecisionRecord[];
  turnTimings: TurnTiming[];

  /** Status */
  status: "idle" | "starting" | "active" | "completed" | "error";
  startTime: number | null;
  endTime: number | null;
  error: string | null;
}

/**
 * Simulation result (episode data)
 */
export interface SimulationResult {
  simulationId: string;
  persona: VoicePersona;
  policyType: "none" | "bandit" | "qlearning";

  /** Outcome */
  completed: boolean;
  pathCompleted: boolean;
  finalState: FSMState;
  outcome: string;

  /** Metrics */
  totalTurns: number;
  totalDurationMs: number;
  avgTurnDurationMs: number;

  /** Captured data */
  transcript: Message[];
  decisions: DecisionRecord[];
  turnTimings: TurnTiming[];

  /** RL episode data */
  totalReturn: number;
}

/**
 * Simulation configuration
 */
export interface SimulationConfig {
  personaId: string;
  policyType: "none" | "bandit" | "qlearning";
  learnerStatePath?: string; // Path to saved learner state
}
