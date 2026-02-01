import type { FSMState, Intent, UserSignal } from "../types";

// Allowed intents per state - what the agent can do in each state
export const STATE_ALLOWED_INTENTS: Record<FSMState, Intent[]> = {
  OPENING: ["PROCEED", "ASK_CLARIFY", "HANDLE_PUSHBACK"],
  DISCLOSURE: ["IDENTIFY_SELF", "ASK_CLARIFY", "PROCEED"],
  IDENTITY_VERIFICATION: ["ASK_VERIFICATION", "CONFIRM_IDENTITY", "ASK_CLARIFY"],
  CONSENT_RECORDING: ["PROCEED", "ASK_CLARIFY", "HANDLE_PUSHBACK"],
  DEBT_CONTEXT: ["PROCEED", "EMPATHIZE", "ASK_CLARIFY"],
  NEGOTIATION: [
    "EMPATHIZE",
    "OFFER_PLAN",
    "COUNTER_OFFER",
    "REQUEST_CALLBACK",
    "HANDLE_PUSHBACK",
    "PROCEED",
  ],
  PAYMENT_SETUP: ["CONFIRM_PLAN", "SEND_PAYMENT_LINK", "ASK_CLARIFY", "PROCEED"],
  WRAPUP: ["SUMMARIZE", "PROCEED"],
  CALLBACK_SCHEDULED: ["SUMMARIZE", "PROCEED"],
  DISPUTE_FLOW: ["ACKNOWLEDGE_DISPUTE", "EMPATHIZE", "PROCEED"],
  WRONG_PARTY_FLOW: ["APOLOGIZE", "PROCEED"],
  DO_NOT_CALL: ["ACKNOWLEDGE_DNC", "PROCEED"],
  ESCALATE_HUMAN: ["ESCALATE", "PROCEED"],
  END_CALL: ["SUMMARIZE"],
};

// Standard transitions from one state to the next
const STANDARD_TRANSITIONS: Partial<Record<FSMState, FSMState>> = {
  OPENING: "DISCLOSURE",
  DISCLOSURE: "CONSENT_RECORDING",
  // IDENTITY_VERIFICATION is skipped in standard flow but can be reached via forceTransition()
  CONSENT_RECORDING: "DEBT_CONTEXT",
  DEBT_CONTEXT: "NEGOTIATION",
  NEGOTIATION: "PAYMENT_SETUP",
  PAYMENT_SETUP: "WRAPUP",
  WRAPUP: "END_CALL",
  DISPUTE_FLOW: "END_CALL",
  WRONG_PARTY_FLOW: "END_CALL",
  DO_NOT_CALL: "END_CALL",
  ESCALATE_HUMAN: "END_CALL",
};

// Signals that force immediate transitions regardless of current state
export const FORCED_TRANSITION_SIGNALS: Record<UserSignal, FSMState | null> = {
  STOP_CONTACT: "DO_NOT_CALL",
  DISPUTE: "DISPUTE_FLOW",
  WRONG_PARTY: "WRONG_PARTY_FLOW",
  ATTORNEY_REPRESENTED: "END_CALL",
  INCONVENIENT_TIME: null, // Request callback, don't force transition
  CALLBACK_REQUEST: null, // Handle in negotiation
  AGREEMENT: null,
  REFUSAL: null,
  CONFUSION: null,
  HOSTILITY: "ESCALATE_HUMAN",
};

// States that can be exited (non-terminal states)
const NON_TERMINAL_STATES: FSMState[] = [
  "OPENING",
  "DISCLOSURE",
  "IDENTITY_VERIFICATION",
  "CONSENT_RECORDING",
  "DEBT_CONTEXT",
  "NEGOTIATION",
  "PAYMENT_SETUP",
  "WRAPUP",
  "DISPUTE_FLOW",
  "WRONG_PARTY_FLOW",
  "DO_NOT_CALL",
  "ESCALATE_HUMAN",
];

export interface FSMContext {
  currentState: FSMState;
  stateHistory: FSMState[];
  slots: Record<string, string | number | boolean>;
}

export interface FSMTransitionResult {
  newState: FSMState;
  wasForced: boolean;
  reason: string;
}

export class FSMEngine {
  private context: FSMContext;

  constructor(initialState: FSMState = "OPENING") {
    this.context = {
      currentState: initialState,
      stateHistory: [initialState],
      slots: {},
    };
  }

  getContext(): FSMContext {
    return { ...this.context };
  }

  getCurrentState(): FSMState {
    return this.context.currentState;
  }

  getAllowedIntents(): Intent[] {
    return STATE_ALLOWED_INTENTS[this.context.currentState] || [];
  }

  getSlot(key: string): string | number | boolean | undefined {
    return this.context.slots[key];
  }

  setSlot(key: string, value: string | number | boolean): void {
    this.context.slots[key] = value;
  }

  // Check if any signals should force a transition
  checkForcedTransition(signals: UserSignal[]): FSMState | null {
    for (const signal of signals) {
      const forcedState = FORCED_TRANSITION_SIGNALS[signal];
      if (forcedState) {
        return forcedState;
      }
    }
    return null;
  }

  // Advance to the next state based on signals or standard flow
  transition(signals: UserSignal[] = []): FSMTransitionResult {
    const currentState = this.context.currentState;

    // Check for terminal state
    if (currentState === "END_CALL") {
      return {
        newState: "END_CALL",
        wasForced: false,
        reason: "Already in terminal state",
      };
    }

    // Check for forced transitions first
    const forcedState = this.checkForcedTransition(signals);
    if (forcedState) {
      this.context.currentState = forcedState;
      this.context.stateHistory.push(forcedState);
      return {
        newState: forcedState,
        wasForced: true,
        reason: `Forced by signal: ${signals.find((s) => FORCED_TRANSITION_SIGNALS[s] === forcedState)}`,
      };
    }

    // Standard transition
    const nextState = STANDARD_TRANSITIONS[currentState];
    if (nextState) {
      this.context.currentState = nextState;
      this.context.stateHistory.push(nextState);
      return {
        newState: nextState,
        wasForced: false,
        reason: "Standard flow progression",
      };
    }

    // No transition available (shouldn't happen if properly configured)
    return {
      newState: currentState,
      wasForced: false,
      reason: "No transition available from current state",
    };
  }

  // Force transition to a specific state (used by policy engine)
  forceTransition(targetState: FSMState, reason: string): FSMTransitionResult {
    this.context.currentState = targetState;
    this.context.stateHistory.push(targetState);
    return {
      newState: targetState,
      wasForced: true,
      reason,
    };
  }

  // Check if we can transition to a specific state
  canTransitionTo(targetState: FSMState): boolean {
    const currentState = this.context.currentState;

    // Can always go to forced states
    if (["DO_NOT_CALL", "DISPUTE_FLOW", "WRONG_PARTY_FLOW", "ESCALATE_HUMAN", "END_CALL"].includes(targetState)) {
      return true;
    }

    // Check standard transition
    return STANDARD_TRANSITIONS[currentState] === targetState;
  }

  // Reset to initial state
  reset(): void {
    this.context = {
      currentState: "OPENING",
      stateHistory: ["OPENING"],
      slots: {},
    };
  }
}

// Export a factory function for creating FSM instances
export function createFSM(initialState: FSMState = "OPENING"): FSMEngine {
  return new FSMEngine(initialState);
}
