/**
 * Unified Agent Types
 */

import type { CaseData, FSMState, PolicyConfig, Intent } from "../types";
import type { Learner, RLState, RLAction } from "../../rl/types";

// Agent mode: voice uses Realtime API, text uses Chat API
export type AgentMode = "voice" | "text";

// Policy mode: autonomous agent decides, rl-controlled learner decides
export type PolicyMode = "autonomous" | "rl-controlled";

// Agent configuration
export interface AgentConfig {
  mode: AgentMode;
  policyMode: PolicyMode;
  caseData: CaseData;
  policyConfig: PolicyConfig;
  learner?: Learner; // Required when policyMode is "rl-controlled"
}

// Agent I/O interface - abstracts voice vs text
export interface AgentIO {
  connect(): Promise<void>;
  sendMessage(text: string): Promise<void>;
  receiveMessage(): Promise<string>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

// Turn result from processing a borrower message
export interface TurnResult {
  agentUtterance: string;
  action: RLAction;
  fsmState: FSMState;
  fsmTransition: {
    from: FSMState;
    to: FSMState;
    wasForced: boolean;
    reason: string;
  } | null;
}

// Session result when agent session completes
export interface SessionResult {
  success: boolean;
  finalState: FSMState;
  turns: number;
  outcome: string;
  error?: string;
}

// Callbacks for agent events
export interface AgentCallbacks {
  onTurnComplete?: (turn: TurnResult) => void;
  onStateChange?: (from: FSMState, to: FSMState) => void;
  onSessionEnd?: (result: SessionResult) => void;
  onError?: (error: Error) => void;
}
