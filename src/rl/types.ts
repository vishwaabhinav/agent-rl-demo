/**
 * Core RL types for the bounded agent learning environment.
 *
 * These types define the state/action/reward interface that learners
 * interact with, built on top of the existing FSM and session types.
 */

import type { FSMState, Intent, UserSignal, CaseData, TurnTrace } from "../lib/types";

// ============ State Representation ============

/**
 * Debt amount buckets for state representation.
 */
export type DebtBucket = "LOW" | "MEDIUM" | "HIGH";

/**
 * Days past due buckets.
 */
export type DaysPastDueBucket = "30" | "60" | "90" | "120+";

/**
 * Sentiment classification.
 */
export type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

/**
 * The state representation seen by the learner.
 * Structured features extracted from FSM, session, and case data.
 */
export interface RLState {
  // FSM state
  fsmState: FSMState;

  // Turn information
  turnCount: number;
  timeInState: number; // Turns spent in current FSM state

  // Case characteristics
  debtBucket: DebtBucket;
  daysPastDueBucket: DaysPastDueBucket;
  priorAttempts: number;

  // Progress flags
  identityVerified: boolean;
  disclosureComplete: boolean;

  // Interaction signals
  lastSignal: UserSignal | null;
  sentiment: Sentiment;
  objectionsRaised: number; // Count of REFUSAL/DISPUTE signals
  offersMade: number; // Count of OFFER_PLAN/COUNTER_OFFER actions
}

/**
 * Discretized state key for tabular methods (Q-learning).
 * Converts RLState to a string for use as hash map key.
 */
export type DiscreteStateKey = string;

// ============ Action Space ============

/**
 * RL actions map directly to the existing Intent type.
 * The learner picks an intent, the LLM generates the wording.
 */
export type RLAction = Intent;

/**
 * Mapping from FSM state to allowed actions.
 * Imported from FSM but typed here for clarity.
 */
export type AllowedActionsMap = Record<FSMState, RLAction[]>;

// ============ Environment Interface ============

/**
 * Result of taking a step in the environment.
 */
export interface StepResult {
  state: RLState;
  reward: number;
  done: boolean;
  info: StepInfo;
}

/**
 * Additional information from a step.
 */
export interface StepInfo {
  fsmTransition: {
    from: FSMState;
    to: FSMState;
    wasForced: boolean;
    reason: string;
  };
  agentUtterance: string;
  borrowerResponse: string;
  detectedSignals: UserSignal[];
  terminalReason?: TerminalReason;
  rewardBreakdown: RewardBreakdown;
}

/**
 * Reasons for episode termination.
 */
export type TerminalReason =
  | "PAYMENT_SETUP_COMPLETE"
  | "PROMISE_TO_PAY"
  | "CALLBACK_SCHEDULED"
  | "BORROWER_HANGUP"
  | "COMPLIANCE_VIOLATION"
  | "ESCALATE_HUMAN"
  | "MAX_TURNS_REACHED"
  | "END_CALL_REACHED";

/**
 * Breakdown of reward components for analysis.
 */
export interface RewardBreakdown {
  shaping: number; // Intermediate progress rewards
  terminal: number; // End-of-episode reward
  turnPenalty: number; // Per-turn cost
  total: number;
}

// ============ Trajectory ============

/**
 * A single transition in the environment.
 */
export interface Transition {
  state: RLState;
  action: RLAction;
  reward: number;
  nextState: RLState;
  done: boolean;
  info: StepInfo;
}

/**
 * A complete episode trajectory.
 */
export interface Trajectory {
  transitions: Transition[];
  totalReturn: number;
  length: number;
  outcome: TerminalReason;
  persona: PersonaConfig;
}

// ============ Learner Interface ============

/**
 * Common interface for all learners (bandit, Q-learning, etc.).
 */
export interface Learner {
  /**
   * Select an action given current state and allowed actions.
   */
  selectAction(state: RLState, allowedActions: RLAction[]): RLAction;

  /**
   * Update the learner based on observed transition.
   * For bandits: immediate reward update.
   * For Q-learning: TD update with next state value.
   */
  update(
    state: RLState,
    action: RLAction,
    reward: number,
    nextState: RLState | null,
    done: boolean
  ): void;

  /**
   * Get the current policy for visualization/analysis.
   */
  getPolicy(): PolicySnapshot;

  /**
   * Save learner state to JSON.
   */
  save(): string;

  /**
   * Load learner state from JSON.
   */
  load(data: string): void;

  /**
   * Reset learner to initial state.
   */
  reset(): void;
}

/**
 * Snapshot of learned policy for visualization.
 */
export interface PolicySnapshot {
  type: "bandit" | "qlearning";
  // For Q-learning: Q-values per state-action pair
  qValues?: Map<DiscreteStateKey, Map<RLAction, number>>;
  // For bandit: action scores/weights
  actionScores?: Map<RLAction, number[]>; // weights vector per action
  // Greedy policy: best action per state
  greedyPolicy: Map<DiscreteStateKey, RLAction>;
  // Metadata
  episodesTrained: number;
  lastUpdated: Date;
}

// ============ Learner Configuration ============

/**
 * Configuration for contextual bandit learner.
 */
export interface BanditConfig {
  epsilon: number; // Exploration rate (0-1)
  learningRate: number; // Weight update step size
  initialValue: number; // Initial Q-value for unseen actions
}

/**
 * Configuration for Q-learning.
 */
export interface QLearningConfig {
  alpha: number; // Learning rate
  gamma: number; // Discount factor
  epsilon: number; // Exploration rate
  initialQ: number; // Initial Q-value
}

// ============ Reward Configuration ============

/**
 * Configurable reward values.
 */
export interface RewardConfig {
  // Shaping rewards (intermediate progress)
  identityVerified: number;
  disclosureComplete: number;
  enteredNegotiation: number;
  willingnessSignal: number;
  offerAccepted: number;
  repeatedAction: number;

  // Per-turn penalty
  perTurn: number;

  // Terminal rewards
  paymentSetupComplete: number;
  promiseToPay: number;
  callbackScheduled: number;
  hangupAfterDisclosure: number;
  hangupBeforeDisclosure: number;
  complianceViolation: number;
  escalateHuman: number;
  maxTurnsReached: number;
}

/**
 * Default reward configuration from design doc.
 */
export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  // Shaping
  identityVerified: 0.1,
  disclosureComplete: 0.1,
  enteredNegotiation: 0.2,
  willingnessSignal: 0.2,
  offerAccepted: 0.3,
  repeatedAction: -0.1,

  // Per-turn
  perTurn: -0.05,

  // Terminal
  paymentSetupComplete: 1.0,
  promiseToPay: 0.5,
  callbackScheduled: 0.2,
  hangupAfterDisclosure: -0.3,
  hangupBeforeDisclosure: -0.5,
  complianceViolation: -1.0,
  escalateHuman: 0.0,
  maxTurnsReached: -0.2,
};

// ============ Borrower Simulator ============

/**
 * Willingness to pay level.
 */
export type WillingnessToPay = "LOW" | "MEDIUM" | "HIGH";

/**
 * Financial situation of the borrower.
 */
export type FinancialSituation = "STABLE" | "STRUGGLING" | "HARDSHIP";

/**
 * Borrower temperament.
 */
export type Temperament = "COOPERATIVE" | "NEUTRAL" | "HOSTILE";

/**
 * Borrower knowledge about the debt.
 */
export type DebtKnowledge = "AWARE" | "CONFUSED" | "DISPUTING";

/**
 * Configuration for a borrower persona.
 */
export interface PersonaConfig {
  name: string;
  willingnessToPay: WillingnessToPay;
  financialSituation: FinancialSituation;
  temperament: Temperament;
  debtKnowledge: DebtKnowledge;
  patience: number; // 1-10, turns before frustration escalates
}

/**
 * Response from the borrower simulator.
 */
export interface BorrowerResponse {
  text: string;
  shouldHangup: boolean;
  detectedSignal?: UserSignal;
  patienceRemaining: number;
}

// ============ Evaluation Metrics ============

/**
 * Metrics for a single episode.
 */
export interface EpisodeMetrics {
  episodeId: number;
  return_: number; // Total reward (return is reserved word)
  length: number;
  outcome: TerminalReason;
  persona: PersonaConfig;
  trajectory: Trajectory;
  timestamp: Date;
}

/**
 * Aggregate metrics over multiple episodes.
 */
export interface AggregateMetrics {
  numEpisodes: number;
  avgReturn: number;
  stdReturn: number;
  successRate: number; // % reaching PAYMENT_SETUP
  partialSuccessRate: number; // % reaching PTP or callback
  avgLength: number;
  hangupRate: number;
  escalationRate: number;
}

/**
 * Learning curve data point.
 */
export interface LearningCurvePoint {
  episode: number;
  trainReturn: number;
  evalReturn?: number;
  evalSuccessRate?: number;
}

// ============ Environment Configuration ============

/**
 * Configuration for the RL environment.
 */
export interface EnvironmentConfig {
  maxTurnsPerEpisode: number;
  rewardConfig: RewardConfig;
  defaultPersona?: PersonaConfig;
}

/**
 * Default environment configuration.
 */
export const DEFAULT_ENV_CONFIG: EnvironmentConfig = {
  maxTurnsPerEpisode: 30,
  rewardConfig: DEFAULT_REWARD_CONFIG,
};
