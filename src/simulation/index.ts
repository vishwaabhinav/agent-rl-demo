/**
 * Simulation module exports
 */

// Types
export type {
  VoicePersona,
  BorrowerFSMState,
  DecisionRecord,
  TurnTiming,
  SimulationSession,
  SimulationResult,
  SimulationConfig,
} from "./types";

// Personas
export {
  PERSONAS,
  SUCCESSFUL_COLLECTION,
  DISPUTER,
  WRONG_PARTY,
  DO_NOT_CALL,
  CALLBACK_SCHEDULER,
  ESCALATOR,
  getPersonaById,
  getPersonaIds,
} from "./personas";

// Borrower FSM
export {
  initBorrowerFSM,
  checkTransition,
  advanceFSM,
  incrementAttempts,
  isMaxAttemptsExceeded,
  isPathComplete,
  getCurrentStateHint,
  getPathProgress,
} from "./borrower-fsm";

// Prompts
export {
  buildBorrowerInstructions,
  buildBorrowerStatePrompt,
  buildCorrectionPrompt,
} from "./borrower-prompts";

// Orchestrator
export {
  runSimulation,
  stopSimulation,
  type OrchestratorCallbacks,
} from "./orchestrator";
