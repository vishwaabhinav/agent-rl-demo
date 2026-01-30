/**
 * Contextual Bandit Learner
 *
 * Treats each decision point independently. Learns a linear model per action
 * that predicts expected reward given state features.
 */

import type {
  RLState,
  RLAction,
  PolicySnapshot,
  BanditConfig,
  DiscreteStateKey,
} from "../types";
import {
  BaseLearner,
  stateToFeatures,
  getFeatureDimension,
  dotProduct,
  epsilonGreedy,
} from "./base";
import { discretizeState } from "../environment/state-extractor";

/**
 * Default bandit configuration.
 */
export const DEFAULT_BANDIT_CONFIG: BanditConfig = {
  epsilon: 0.1,
  learningRate: 0.01,
  initialValue: 0.0,
};

/**
 * All possible actions (intents).
 */
const ALL_ACTIONS: RLAction[] = [
  "PROCEED",
  "ASK_CLARIFY",
  "HANDLE_PUSHBACK",
  "IDENTIFY_SELF",
  "ASK_VERIFICATION",
  "CONFIRM_IDENTITY",
  "EMPATHIZE",
  "OFFER_PLAN",
  "COUNTER_OFFER",
  "REQUEST_CALLBACK",
  "CONFIRM_PLAN",
  "SEND_PAYMENT_LINK",
  "SUMMARIZE",
  "ACKNOWLEDGE_DISPUTE",
  "ACKNOWLEDGE_DNC",
  "APOLOGIZE",
  "ESCALATE",
];

/**
 * Contextual Bandit learner with linear function approximation.
 */
export class BanditLearner extends BaseLearner {
  private config: BanditConfig;
  private weights: Map<RLAction, number[]>; // Weights per action
  private featureDim: number;

  constructor(config: BanditConfig = DEFAULT_BANDIT_CONFIG) {
    super();
    this.config = config;
    this.featureDim = getFeatureDimension();
    this.weights = new Map();
    this.initializeWeights();
  }

  /**
   * Initialize weights for all actions.
   */
  private initializeWeights(): void {
    for (const action of ALL_ACTIONS) {
      const weights = new Array(this.featureDim).fill(this.config.initialValue);
      // Add small random noise for symmetry breaking
      for (let i = 0; i < weights.length; i++) {
        weights[i] += (Math.random() - 0.5) * 0.01;
      }
      this.weights.set(action, weights);
    }
  }

  /**
   * Compute predicted reward for action given state.
   */
  private predict(state: RLState, action: RLAction): number {
    const features = stateToFeatures(state);
    const weights = this.weights.get(action);
    if (!weights) return 0;
    return dotProduct(features, weights);
  }

  /**
   * Select action using epsilon-greedy.
   */
  selectAction(state: RLState, allowedActions: RLAction[]): RLAction {
    // Compute predicted values for allowed actions
    const actionValues = new Map<RLAction, number>();
    for (const action of allowedActions) {
      actionValues.set(action, this.predict(state, action));
    }

    return epsilonGreedy(actionValues, allowedActions, this.config.epsilon);
  }

  /**
   * Update weights for chosen action based on observed reward.
   * Uses simple gradient descent: w = w + lr * (reward - prediction) * features
   */
  update(
    state: RLState,
    action: RLAction,
    reward: number,
    _nextState: RLState | null,
    done: boolean
  ): void {
    const features = stateToFeatures(state);
    const weights = this.weights.get(action);

    if (!weights) return;

    const prediction = dotProduct(features, weights);
    const error = reward - prediction;

    // Gradient update
    for (let i = 0; i < weights.length; i++) {
      weights[i] += this.config.learningRate * error * features[i];
    }

    if (done) {
      this.incrementEpisode();
    }
  }

  /**
   * Get current policy snapshot.
   */
  getPolicy(): PolicySnapshot {
    // Convert weights to action scores map
    const actionScores = new Map<RLAction, number[]>();
    Array.from(this.weights.entries()).forEach(([action, weights]) => {
      actionScores.set(action, weights.slice());
    });

    // Compute greedy policy for common states
    const greedyPolicy = new Map<DiscreteStateKey, RLAction>();

    // Sample some representative states
    const sampleStates = this.getSampleStates();
    for (const state of sampleStates) {
      const stateKey = discretizeState(state);
      const allowedActions = this.getAllowedActionsForState(state.fsmState);
      if (allowedActions.length > 0) {
        const actionValues = new Map<RLAction, number>();
        for (const action of allowedActions) {
          actionValues.set(action, this.predict(state, action));
        }
        greedyPolicy.set(stateKey, epsilonGreedy(actionValues, allowedActions, 0));
      }
    }

    return {
      type: "bandit",
      actionScores,
      greedyPolicy,
      ...this.getBaseMetadata(),
    };
  }

  /**
   * Get allowed actions for FSM state (simplified).
   */
  private getAllowedActionsForState(fsmState: string): RLAction[] {
    const stateActions: Record<string, RLAction[]> = {
      OPENING: ["PROCEED", "ASK_CLARIFY", "HANDLE_PUSHBACK"],
      DISCLOSURE: ["IDENTIFY_SELF", "ASK_CLARIFY", "PROCEED"],
      IDENTITY_VERIFICATION: ["ASK_VERIFICATION", "CONFIRM_IDENTITY", "ASK_CLARIFY"],
      CONSENT_RECORDING: ["PROCEED", "ASK_CLARIFY", "HANDLE_PUSHBACK"],
      DEBT_CONTEXT: ["PROCEED", "EMPATHIZE", "ASK_CLARIFY"],
      NEGOTIATION: ["EMPATHIZE", "OFFER_PLAN", "COUNTER_OFFER", "REQUEST_CALLBACK", "HANDLE_PUSHBACK", "PROCEED"],
      PAYMENT_SETUP: ["CONFIRM_PLAN", "SEND_PAYMENT_LINK", "ASK_CLARIFY", "PROCEED"],
      WRAPUP: ["SUMMARIZE", "PROCEED"],
      DISPUTE_FLOW: ["ACKNOWLEDGE_DISPUTE", "EMPATHIZE", "PROCEED"],
      WRONG_PARTY_FLOW: ["APOLOGIZE", "PROCEED"],
      DO_NOT_CALL: ["ACKNOWLEDGE_DNC", "PROCEED"],
      ESCALATE_HUMAN: ["ESCALATE", "PROCEED"],
      END_CALL: ["SUMMARIZE"],
    };
    return stateActions[fsmState] || ["PROCEED"];
  }

  /**
   * Generate sample states for policy visualization.
   */
  private getSampleStates(): RLState[] {
    const states: RLState[] = [];
    const fsmStates = ["OPENING", "NEGOTIATION", "PAYMENT_SETUP"] as const;
    const sentiments = ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const;

    for (const fsmState of fsmStates) {
      for (const sentiment of sentiments) {
        states.push({
          fsmState: fsmState as any,
          turnCount: 5,
          timeInState: 2,
          debtBucket: "MEDIUM",
          daysPastDueBucket: "60",
          priorAttempts: 1,
          identityVerified: true,
          disclosureComplete: fsmState !== "OPENING",
          lastSignal: null,
          sentiment,
          objectionsRaised: sentiment === "NEGATIVE" ? 1 : 0,
          offersMade: fsmState === "NEGOTIATION" ? 1 : 0,
        });
      }
    }

    return states;
  }

  /**
   * Save learner state to JSON.
   */
  save(): string {
    const data = {
      config: this.config,
      weights: Object.fromEntries(this.weights),
      episodesTrained: this.episodesTrained,
      lastUpdated: this.lastUpdated.toISOString(),
    };
    return JSON.stringify(data);
  }

  /**
   * Load learner state from JSON.
   */
  load(jsonData: string): void {
    const data = JSON.parse(jsonData);
    this.config = data.config;
    this.weights = new Map(Object.entries(data.weights) as [RLAction, number[]][]);
    this.episodesTrained = data.episodesTrained;
    this.lastUpdated = new Date(data.lastUpdated);
  }

  /**
   * Reset learner to initial state.
   */
  reset(): void {
    this.initializeWeights();
    this.episodesTrained = 0;
    this.lastUpdated = new Date();
  }

  /**
   * Get action weights for visualization.
   */
  getActionWeights(action: RLAction): number[] | undefined {
    return this.weights.get(action);
  }

  /**
   * Set configuration (e.g., for decaying epsilon).
   */
  setConfig(config: Partial<BanditConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
