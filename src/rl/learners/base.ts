/**
 * Base Learner Interface and Utilities
 *
 * Common interface that all learners implement, plus shared utilities.
 */

import type {
  RLState,
  RLAction,
  Learner,
  PolicySnapshot,
  DiscreteStateKey,
} from "../types";
import { discretizeState } from "../environment/state-extractor";

/**
 * Epsilon-greedy action selection.
 * With probability epsilon, pick random. Otherwise pick best.
 */
export function epsilonGreedy(
  actionValues: Map<RLAction, number>,
  allowedActions: RLAction[],
  epsilon: number
): RLAction {
  if (Math.random() < epsilon) {
    // Random exploration
    return allowedActions[Math.floor(Math.random() * allowedActions.length)];
  }

  // Greedy exploitation
  let bestAction = allowedActions[0];
  let bestValue = actionValues.get(bestAction) ?? 0;

  for (const action of allowedActions) {
    const value = actionValues.get(action) ?? 0;
    if (value > bestValue) {
      bestValue = value;
      bestAction = action;
    }
  }

  return bestAction;
}

/**
 * Softmax action selection with temperature.
 */
export function softmaxSelect(
  actionValues: Map<RLAction, number>,
  allowedActions: RLAction[],
  temperature: number = 1.0
): RLAction {
  if (temperature <= 0) {
    // Greedy
    return epsilonGreedy(actionValues, allowedActions, 0);
  }

  // Compute softmax probabilities
  const values = allowedActions.map((a) => actionValues.get(a) ?? 0);
  const maxValue = Math.max(...values);

  // Subtract max for numerical stability
  const expValues = values.map((v) => Math.exp((v - maxValue) / temperature));
  const sumExp = expValues.reduce((a, b) => a + b, 0);
  const probs = expValues.map((e) => e / sumExp);

  // Sample from distribution
  const random = Math.random();
  let cumulative = 0;

  for (let i = 0; i < allowedActions.length; i++) {
    cumulative += probs[i];
    if (random < cumulative) {
      return allowedActions[i];
    }
  }

  // Fallback (shouldn't reach here)
  return allowedActions[allowedActions.length - 1];
}

/**
 * Get argmax action from values.
 */
export function argmax(
  actionValues: Map<RLAction, number>,
  allowedActions: RLAction[]
): RLAction {
  let bestAction = allowedActions[0];
  let bestValue = actionValues.get(bestAction) ?? -Infinity;

  for (const action of allowedActions) {
    const value = actionValues.get(action) ?? -Infinity;
    if (value > bestValue) {
      bestValue = value;
      bestAction = action;
    }
  }

  return bestAction;
}

/**
 * Convert state to features array for linear models.
 * Returns normalized numeric features.
 */
export function stateToFeatures(state: RLState): number[] {
  const features: number[] = [];

  // FSM state as one-hot (13 states)
  const fsmStates = [
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
    "END_CALL",
  ];
  for (const s of fsmStates) {
    features.push(state.fsmState === s ? 1 : 0);
  }

  // Numeric features (normalized to ~[0,1])
  features.push(state.turnCount / 20); // Normalize by typical max
  features.push(state.timeInState / 5);
  features.push(state.priorAttempts / 5);
  features.push(state.objectionsRaised / 3);
  features.push(state.offersMade / 3);

  // Binary features
  features.push(state.identityVerified ? 1 : 0);
  features.push(state.disclosureComplete ? 1 : 0);

  // Debt bucket (one-hot)
  features.push(state.debtBucket === "LOW" ? 1 : 0);
  features.push(state.debtBucket === "MEDIUM" ? 1 : 0);
  features.push(state.debtBucket === "HIGH" ? 1 : 0);

  // Days past due bucket (one-hot)
  features.push(state.daysPastDueBucket === "30" ? 1 : 0);
  features.push(state.daysPastDueBucket === "60" ? 1 : 0);
  features.push(state.daysPastDueBucket === "90" ? 1 : 0);
  features.push(state.daysPastDueBucket === "120+" ? 1 : 0);

  // Sentiment (one-hot)
  features.push(state.sentiment === "POSITIVE" ? 1 : 0);
  features.push(state.sentiment === "NEUTRAL" ? 1 : 0);
  features.push(state.sentiment === "NEGATIVE" ? 1 : 0);

  // Last signal categories
  const positiveSignals = ["AGREEMENT"];
  const negativeSignals = ["REFUSAL", "DISPUTE", "HOSTILITY", "STOP_CONTACT"];
  features.push(state.lastSignal && positiveSignals.includes(state.lastSignal) ? 1 : 0);
  features.push(state.lastSignal && negativeSignals.includes(state.lastSignal) ? 1 : 0);

  // Bias term
  features.push(1);

  return features;
}

/**
 * Get feature dimension for linear models.
 */
export function getFeatureDimension(): number {
  // 13 (FSM) + 5 (numeric) + 2 (binary) + 3 (debt) + 4 (dpd) + 3 (sentiment) + 2 (signal) + 1 (bias)
  return 33;
}

/**
 * Dot product of two arrays.
 */
export function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Abstract base class providing common functionality.
 */
export abstract class BaseLearner implements Learner {
  protected episodesTrained: number = 0;
  protected lastUpdated: Date = new Date();

  abstract selectAction(state: RLState, allowedActions: RLAction[]): RLAction;

  abstract update(
    state: RLState,
    action: RLAction,
    reward: number,
    nextState: RLState | null,
    done: boolean
  ): void;

  abstract getPolicy(): PolicySnapshot;

  abstract save(): string;

  abstract load(data: string): void;

  abstract reset(): void;

  /**
   * Increment episode counter.
   */
  protected incrementEpisode(): void {
    this.episodesTrained++;
    this.lastUpdated = new Date();
  }

  /**
   * Get base metadata for policy snapshot.
   */
  protected getBaseMetadata(): { episodesTrained: number; lastUpdated: Date } {
    return {
      episodesTrained: this.episodesTrained,
      lastUpdated: this.lastUpdated,
    };
  }
}
