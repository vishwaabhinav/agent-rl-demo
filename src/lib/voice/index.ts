/**
 * Voice module - shared infrastructure for calls and simulation
 */

// Types
export type {
  CallStatus,
  BaseVoiceSession,
  VoiceSession,
  RealtimeSessionConfig,
  RealtimeSessionCallbacks,
  RealtimeSessionHandle,
  StateClassificationResult,
  FloorController,
  FloorControllerConfig,
} from "./types";

// FSM validation
export {
  VALID_STATES,
  MAIN_FLOW_ORDER,
  SPECIAL_STATES,
  TERMINAL_STATES,
  isValidTransition,
  isTerminalState,
  getNextMainFlowState,
  getMainFlowIndex,
  isMainFlowState,
  isSpecialState,
} from "./fsm-validation";

// State classification
export {
  classifyStateWithLLM,
  shouldApplyTransition,
} from "./state-classifier";

// Prompt builders
export {
  buildAgentInstructions,
  buildIntentInjection,
  buildStateTransitionPrompt,
  buildGreetingTrigger,
} from "./prompts";

// Realtime session management
export {
  createRealtimeSession,
  createConnectedRealtimeSessions,
  createFloorController,
} from "./realtime";
