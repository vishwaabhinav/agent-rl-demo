/**
 * Learner Factory
 *
 * Creates learner instances from saved state (for loading trained policies).
 */

import type { Learner } from "../types";
import { BanditLearner } from "./bandit";
import { QLearner } from "./qlearning";

export interface SavedLearnerState {
  type: "bandit" | "qlearning";
  learnerState: Record<string, unknown>;
}

/**
 * Create a learner from saved state.
 */
export function createLearnerFromState(saved: SavedLearnerState): Learner {
  const { type, learnerState } = saved;

  if (type === "bandit") {
    // Create bandit with default config, then load state
    const bandit = new BanditLearner();
    bandit.load(JSON.stringify(learnerState));
    return bandit;
  }

  if (type === "qlearning") {
    // Create Q-learner with default config, then load state
    const qlearning = new QLearner();
    qlearning.load(JSON.stringify(learnerState));
    return qlearning;
  }

  throw new Error(`Unknown learner type: ${type}`);
}

/**
 * Create a fresh (untrained) learner of the specified type.
 */
export function createFreshLearner(type: "bandit" | "qlearning"): Learner {
  if (type === "bandit") {
    return new BanditLearner();
  }

  if (type === "qlearning") {
    return new QLearner();
  }

  throw new Error(`Unknown learner type: ${type}`);
}
