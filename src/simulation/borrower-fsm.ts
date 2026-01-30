/**
 * Borrower FSM - enforces persona path through conversation
 */

import type { FSMState } from "../lib/types";
import type { VoicePersona, BorrowerFSMState } from "./types";

/**
 * Initialize borrower FSM state from persona
 */
export function initBorrowerFSM(persona: VoicePersona): BorrowerFSMState {
  return {
    persona,
    pathIndex: 0,
    currentState: persona.path[0],
    expectedNextState: persona.path.length > 1 ? persona.path[1] : null,
    attemptsAtCurrentState: 0,
    maxAttemptsPerState: 3,
  };
}

/**
 * Check if agent transitioned to expected state
 */
export function checkTransition(
  fsm: BorrowerFSMState,
  agentState: FSMState
): { matched: boolean; shouldAdvance: boolean; error?: string } {
  // If we're at the end of path, just check we're in a terminal state
  if (fsm.expectedNextState === null) {
    return { matched: true, shouldAdvance: false };
  }

  // Check if agent is in our expected next state
  if (agentState === fsm.expectedNextState) {
    return { matched: true, shouldAdvance: true };
  }

  // Agent is still in current state - not an error, just hasn't transitioned yet
  if (agentState === fsm.currentState) {
    return { matched: false, shouldAdvance: false };
  }

  // Agent went to unexpected state - this is a drift error
  return {
    matched: false,
    shouldAdvance: false,
    error: `Expected transition to ${fsm.expectedNextState}, but agent went to ${agentState}`,
  };
}

/**
 * Advance FSM to next state in path
 */
export function advanceFSM(fsm: BorrowerFSMState): BorrowerFSMState {
  const nextIndex = fsm.pathIndex + 1;

  if (nextIndex >= fsm.persona.path.length) {
    // At end of path
    return {
      ...fsm,
      pathIndex: nextIndex,
      currentState: fsm.persona.path[fsm.persona.path.length - 1],
      expectedNextState: null,
      attemptsAtCurrentState: 0,
    };
  }

  return {
    ...fsm,
    pathIndex: nextIndex,
    currentState: fsm.persona.path[nextIndex],
    expectedNextState: fsm.persona.path[nextIndex + 1] || null,
    attemptsAtCurrentState: 0,
  };
}

/**
 * Increment attempt counter
 */
export function incrementAttempts(fsm: BorrowerFSMState): BorrowerFSMState {
  return {
    ...fsm,
    attemptsAtCurrentState: fsm.attemptsAtCurrentState + 1,
  };
}

/**
 * Check if max attempts exceeded
 */
export function isMaxAttemptsExceeded(fsm: BorrowerFSMState): boolean {
  return fsm.attemptsAtCurrentState >= fsm.maxAttemptsPerState;
}

/**
 * Check if path is complete
 */
export function isPathComplete(fsm: BorrowerFSMState): boolean {
  return fsm.pathIndex >= fsm.persona.path.length - 1 && fsm.expectedNextState === null;
}

/**
 * Get current state hint for borrower
 */
export function getCurrentStateHint(fsm: BorrowerFSMState): string {
  return fsm.persona.stateHints[fsm.currentState] || "";
}

/**
 * Get progress through path (0-1)
 */
export function getPathProgress(fsm: BorrowerFSMState): number {
  return fsm.pathIndex / (fsm.persona.path.length - 1);
}
