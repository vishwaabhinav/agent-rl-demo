/**
 * FSM state validation for voice conversations
 */

import type { FSMState } from "../types";

/** All valid FSM states */
export const VALID_STATES: FSMState[] = [
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

/** Main flow states in sequential order */
export const MAIN_FLOW_ORDER: FSMState[] = [
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

/** Special/branch states that can be reached from any state */
export const SPECIAL_STATES: FSMState[] = [
  "WRONG_PARTY_FLOW",
  "DISPUTE_FLOW",
  "DO_NOT_CALL",
  "ESCALATE_HUMAN",
  "CALLBACK_SCHEDULED",
];

/** Terminal states that end the conversation */
export const TERMINAL_STATES: FSMState[] = [
  "END_CALL",
  "DO_NOT_CALL",
  "WRONG_PARTY_FLOW",
  "ESCALATE_HUMAN",
];

/**
 * Check if a state transition is valid.
 * Rules:
 * - Special states can be reached from anywhere
 * - Same state is always valid (no transition)
 * - From special states, can go to any main flow state
 * - In main flow, can only move one step forward
 */
export function isValidTransition(from: FSMState, to: FSMState): boolean {
  // Special states can be reached from anywhere
  if (SPECIAL_STATES.includes(to)) {
    return true;
  }

  // Same state is always valid
  if (from === to) {
    return true;
  }

  // From special states, can go to any main flow state or END_CALL
  if (SPECIAL_STATES.includes(from)) {
    return true;
  }

  const fromIdx = MAIN_FLOW_ORDER.indexOf(from);
  const toIdx = MAIN_FLOW_ORDER.indexOf(to);

  // If either state isn't in main flow, allow it
  if (fromIdx === -1 || toIdx === -1) {
    return true;
  }

  // Only allow single step forward in main flow (prevents skipping states)
  return toIdx === fromIdx + 1;
}

/**
 * Check if a state is terminal (conversation should end)
 */
export function isTerminalState(state: FSMState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Get the next expected state in the main flow
 */
export function getNextMainFlowState(current: FSMState): FSMState | null {
  const idx = MAIN_FLOW_ORDER.indexOf(current);
  if (idx === -1 || idx === MAIN_FLOW_ORDER.length - 1) {
    return null;
  }
  return MAIN_FLOW_ORDER[idx + 1];
}

/**
 * Get the index of a state in the main flow (-1 if not in main flow)
 */
export function getMainFlowIndex(state: FSMState): number {
  return MAIN_FLOW_ORDER.indexOf(state);
}

/**
 * Check if a state is in the main flow
 */
export function isMainFlowState(state: FSMState): boolean {
  return MAIN_FLOW_ORDER.includes(state);
}

/**
 * Check if a state is a special/branch state
 */
export function isSpecialState(state: FSMState): boolean {
  return SPECIAL_STATES.includes(state);
}
