/**
 * Reward Calculator
 *
 * Computes shaped rewards for state transitions and terminal outcomes.
 * Tracks already-given rewards to avoid double-counting.
 */

import type { FSMState, UserSignal } from "../../lib/types";
import type {
  RLState,
  RLAction,
  RewardConfig,
  RewardBreakdown,
  TerminalReason,
} from "../types";
import { DEFAULT_REWARD_CONFIG } from "../types";

/**
 * Tracks which shaping rewards have been given in an episode.
 * Prevents double-rewarding for the same milestone.
 */
export interface RewardTracker {
  identityVerifiedRewarded: boolean;
  disclosureCompleteRewarded: boolean;
  enteredNegotiationRewarded: boolean;
  willingnessSignalRewarded: boolean;
  offerAcceptedRewarded: boolean;
  lastAction: RLAction | null;
}

/**
 * Create a fresh reward tracker for a new episode.
 */
export function createRewardTracker(): RewardTracker {
  return {
    identityVerifiedRewarded: false,
    disclosureCompleteRewarded: false,
    enteredNegotiationRewarded: false,
    willingnessSignalRewarded: false,
    offerAcceptedRewarded: false,
    lastAction: null,
  };
}

/**
 * Terminal states that end the episode.
 */
const TERMINAL_STATES: FSMState[] = [
  "END_CALL",
  "DO_NOT_CALL",
  "ESCALATE_HUMAN",
];

/**
 * Check if a state is terminal.
 */
export function isTerminalState(state: FSMState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Determine terminal reason from final state and context.
 */
export function determineTerminalReason(
  state: RLState,
  signals: UserSignal[],
  maxTurnsReached: boolean
): TerminalReason | null {
  if (maxTurnsReached) {
    return "MAX_TURNS_REACHED";
  }

  // Check for borrower hangup signals
  if (signals.includes("STOP_CONTACT")) {
    return "BORROWER_HANGUP";
  }

  // Check FSM state for terminal reason
  switch (state.fsmState) {
    case "END_CALL":
      // Determine why we ended
      if (state.offersMade > 0 && state.lastSignal === "AGREEMENT") {
        return "PAYMENT_SETUP_COMPLETE";
      }
      return "END_CALL_REACHED";

    case "PAYMENT_SETUP":
      return "PAYMENT_SETUP_COMPLETE";

    case "CALLBACK_SCHEDULED":
      return "CALLBACK_SCHEDULED";

    case "DO_NOT_CALL":
      return "BORROWER_HANGUP";

    case "ESCALATE_HUMAN":
      return "ESCALATE_HUMAN";

    case "DISPUTE_FLOW":
      return "BORROWER_HANGUP";

    default:
      return null;
  }
}

/**
 * Calculate shaping reward for a transition.
 * Updates tracker to prevent double-rewarding.
 */
export function calculateShapingReward(
  prevState: RLState,
  action: RLAction,
  newState: RLState,
  signals: UserSignal[],
  tracker: RewardTracker,
  config: RewardConfig = DEFAULT_REWARD_CONFIG
): number {
  let reward = 0;

  // Identity verification milestone
  if (
    newState.identityVerified &&
    !prevState.identityVerified &&
    !tracker.identityVerifiedRewarded
  ) {
    reward += config.identityVerified;
    tracker.identityVerifiedRewarded = true;
  }

  // Disclosure complete milestone
  if (
    newState.disclosureComplete &&
    !prevState.disclosureComplete &&
    !tracker.disclosureCompleteRewarded
  ) {
    reward += config.disclosureComplete;
    tracker.disclosureCompleteRewarded = true;
  }

  // Entered negotiation milestone
  if (
    newState.fsmState === "NEGOTIATION" &&
    prevState.fsmState !== "NEGOTIATION" &&
    !tracker.enteredNegotiationRewarded
  ) {
    reward += config.enteredNegotiation;
    tracker.enteredNegotiationRewarded = true;
  }

  // Willingness signal detected
  if (
    signals.includes("AGREEMENT") &&
    !tracker.willingnessSignalRewarded
  ) {
    reward += config.willingnessSignal;
    tracker.willingnessSignalRewarded = true;
  }

  // Offer accepted (agreement after an offer)
  if (
    signals.includes("AGREEMENT") &&
    (tracker.lastAction === "OFFER_PLAN" || tracker.lastAction === "COUNTER_OFFER") &&
    !tracker.offerAcceptedRewarded
  ) {
    reward += config.offerAccepted;
    tracker.offerAcceptedRewarded = true;
  }

  // Penalty for repeated action
  if (action === tracker.lastAction) {
    reward += config.repeatedAction;
  }

  // Update tracker
  tracker.lastAction = action;

  return reward;
}

/**
 * Calculate terminal reward for episode end.
 */
export function calculateTerminalReward(
  terminalReason: TerminalReason,
  state: RLState,
  config: RewardConfig = DEFAULT_REWARD_CONFIG
): number {
  switch (terminalReason) {
    case "PAYMENT_SETUP_COMPLETE":
      return config.paymentSetupComplete;

    case "PROMISE_TO_PAY":
      return config.promiseToPay;

    case "CALLBACK_SCHEDULED":
      return config.callbackScheduled;

    case "BORROWER_HANGUP":
      // Different penalty based on when hangup occurred
      if (state.disclosureComplete) {
        return config.hangupAfterDisclosure;
      }
      return config.hangupBeforeDisclosure;

    case "COMPLIANCE_VIOLATION":
      return config.complianceViolation;

    case "ESCALATE_HUMAN":
      return config.escalateHuman;

    case "MAX_TURNS_REACHED":
      return config.maxTurnsReached;

    case "END_CALL_REACHED":
      // Neutral if we reached end naturally
      return 0;

    default:
      return 0;
  }
}

/**
 * Calculate per-turn penalty.
 */
export function calculateTurnPenalty(
  config: RewardConfig = DEFAULT_REWARD_CONFIG
): number {
  return config.perTurn;
}

/**
 * Calculate full reward for a transition.
 */
export function calculateReward(
  prevState: RLState,
  action: RLAction,
  newState: RLState,
  signals: UserSignal[],
  tracker: RewardTracker,
  terminalReason: TerminalReason | null,
  config: RewardConfig = DEFAULT_REWARD_CONFIG
): RewardBreakdown {
  const shaping = calculateShapingReward(
    prevState,
    action,
    newState,
    signals,
    tracker,
    config
  );

  const terminal = terminalReason
    ? calculateTerminalReward(terminalReason, newState, config)
    : 0;

  const turnPenalty = calculateTurnPenalty(config);

  return {
    shaping,
    terminal,
    turnPenalty,
    total: shaping + terminal + turnPenalty,
  };
}

/**
 * Reward calculator class for stateful reward tracking.
 */
export class RewardCalculator {
  private config: RewardConfig;
  private tracker: RewardTracker;

  constructor(config: RewardConfig = DEFAULT_REWARD_CONFIG) {
    this.config = config;
    this.tracker = createRewardTracker();
  }

  /**
   * Calculate reward for a transition.
   */
  calculate(
    prevState: RLState,
    action: RLAction,
    newState: RLState,
    signals: UserSignal[],
    terminalReason: TerminalReason | null
  ): RewardBreakdown {
    return calculateReward(
      prevState,
      action,
      newState,
      signals,
      this.tracker,
      terminalReason,
      this.config
    );
  }

  /**
   * Reset tracker for new episode.
   */
  reset(): void {
    this.tracker = createRewardTracker();
  }

  /**
   * Get current tracker state (for debugging/analysis).
   */
  getTrackerState(): RewardTracker {
    return { ...this.tracker };
  }
}
