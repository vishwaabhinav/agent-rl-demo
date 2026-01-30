/**
 * Tabular Q-Learning Learner
 *
 * Learns Q(state, action) values using temporal difference learning.
 * Uses discretized state representation for tabular lookup.
 */

import type {
  RLState,
  RLAction,
  PolicySnapshot,
  QLearningConfig,
  DiscreteStateKey,
} from "../types";
import { BaseLearner, epsilonGreedy, argmax } from "./base";
import { discretizeState } from "../environment/state-extractor";

/**
 * Default Q-learning configuration.
 */
export const DEFAULT_QLEARNING_CONFIG: QLearningConfig = {
  alpha: 0.1, // Learning rate
  gamma: 0.95, // Discount factor
  epsilon: 0.1, // Exploration rate
  initialQ: 0.0, // Initial Q-value for unseen state-action pairs
};

/**
 * Tabular Q-Learning learner.
 */
export class QLearner extends BaseLearner {
  private config: QLearningConfig;
  private qTable: Map<DiscreteStateKey, Map<RLAction, number>>;
  private visitCounts: Map<DiscreteStateKey, Map<RLAction, number>>;

  constructor(config: QLearningConfig = DEFAULT_QLEARNING_CONFIG) {
    super();
    this.config = config;
    this.qTable = new Map();
    this.visitCounts = new Map();
  }

  /**
   * Get Q-value for state-action pair.
   * Initializes if not seen before.
   */
  private getQ(stateKey: DiscreteStateKey, action: RLAction): number {
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    const stateQ = this.qTable.get(stateKey)!;
    if (!stateQ.has(action)) {
      stateQ.set(action, this.config.initialQ);
    }
    return stateQ.get(action)!;
  }

  /**
   * Set Q-value for state-action pair.
   */
  private setQ(stateKey: DiscreteStateKey, action: RLAction, value: number): void {
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    this.qTable.get(stateKey)!.set(action, value);
  }

  /**
   * Get max Q-value for next state over allowed actions.
   */
  private getMaxQ(stateKey: DiscreteStateKey, allowedActions: RLAction[]): number {
    let maxQ = -Infinity;
    for (const action of allowedActions) {
      const q = this.getQ(stateKey, action);
      if (q > maxQ) {
        maxQ = q;
      }
    }
    return maxQ === -Infinity ? 0 : maxQ;
  }

  /**
   * Increment visit count for state-action pair.
   */
  private incrementVisit(stateKey: DiscreteStateKey, action: RLAction): void {
    if (!this.visitCounts.has(stateKey)) {
      this.visitCounts.set(stateKey, new Map());
    }
    const stateVisits = this.visitCounts.get(stateKey)!;
    stateVisits.set(action, (stateVisits.get(action) || 0) + 1);
  }

  /**
   * Select action using epsilon-greedy.
   */
  selectAction(state: RLState, allowedActions: RLAction[]): RLAction {
    const stateKey = discretizeState(state);

    // Build action values map
    const actionValues = new Map<RLAction, number>();
    for (const action of allowedActions) {
      actionValues.set(action, this.getQ(stateKey, action));
    }

    return epsilonGreedy(actionValues, allowedActions, this.config.epsilon);
  }

  /**
   * Update Q-value using TD learning.
   * Q(s,a) <- Q(s,a) + alpha * [r + gamma * max_a' Q(s',a') - Q(s,a)]
   */
  update(
    state: RLState,
    action: RLAction,
    reward: number,
    nextState: RLState | null,
    done: boolean
  ): void {
    const stateKey = discretizeState(state);
    const currentQ = this.getQ(stateKey, action);

    let targetQ: number;
    if (done || !nextState) {
      // Terminal state - no future reward
      targetQ = reward;
    } else {
      // Non-terminal - bootstrap from next state
      const nextStateKey = discretizeState(nextState);
      const nextAllowedActions = this.getAllowedActionsForState(nextState.fsmState);
      const maxNextQ = this.getMaxQ(nextStateKey, nextAllowedActions);
      targetQ = reward + this.config.gamma * maxNextQ;
    }

    // TD update
    const newQ = currentQ + this.config.alpha * (targetQ - currentQ);
    this.setQ(stateKey, action, newQ);
    this.incrementVisit(stateKey, action);

    if (done) {
      this.incrementEpisode();
    }
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
   * Get current policy snapshot.
   */
  getPolicy(): PolicySnapshot {
    // Convert Q-table to serializable format
    const qValues = new Map<DiscreteStateKey, Map<RLAction, number>>();
    Array.from(this.qTable.entries()).forEach(([stateKey, actionValues]) => {
      qValues.set(stateKey, new Map(actionValues));
    });

    // Compute greedy policy
    const greedyPolicy = new Map<DiscreteStateKey, RLAction>();
    Array.from(this.qTable.entries()).forEach(([stateKey, actionValues]) => {
      // Get FSM state from key to determine allowed actions
      const fsmStateMatch = stateKey.match(/^fsm:(\w+)/);
      const fsmState = fsmStateMatch ? fsmStateMatch[1] : "OPENING";
      const allowedActions = this.getAllowedActionsForState(fsmState);

      // Filter to allowed actions
      const allowedValues = new Map<RLAction, number>();
      for (const action of allowedActions) {
        if (actionValues.has(action)) {
          allowedValues.set(action, actionValues.get(action)!);
        }
      }

      if (allowedValues.size > 0) {
        greedyPolicy.set(stateKey, argmax(allowedValues, Array.from(allowedValues.keys())));
      }
    });

    return {
      type: "qlearning",
      qValues,
      greedyPolicy,
      ...this.getBaseMetadata(),
    };
  }

  /**
   * Save learner state to JSON.
   */
  save(): string {
    // Convert Maps to objects for JSON serialization
    const qTableObj: Record<string, Record<string, number>> = {};
    Array.from(this.qTable.entries()).forEach(([stateKey, actionValues]) => {
      qTableObj[stateKey] = Object.fromEntries(actionValues);
    });

    const visitCountsObj: Record<string, Record<string, number>> = {};
    Array.from(this.visitCounts.entries()).forEach(([stateKey, actionCounts]) => {
      visitCountsObj[stateKey] = Object.fromEntries(actionCounts);
    });

    const data = {
      config: this.config,
      qTable: qTableObj,
      visitCounts: visitCountsObj,
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

    // Reconstruct Maps
    this.qTable = new Map();
    for (const [stateKey, actionValues] of Object.entries(data.qTable)) {
      this.qTable.set(
        stateKey as DiscreteStateKey,
        new Map(Object.entries(actionValues as Record<string, number>) as [RLAction, number][])
      );
    }

    this.visitCounts = new Map();
    for (const [stateKey, actionCounts] of Object.entries(data.visitCounts)) {
      this.visitCounts.set(
        stateKey as DiscreteStateKey,
        new Map(Object.entries(actionCounts as Record<string, number>) as [RLAction, number][])
      );
    }

    this.episodesTrained = data.episodesTrained;
    this.lastUpdated = new Date(data.lastUpdated);
  }

  /**
   * Reset learner to initial state.
   */
  reset(): void {
    this.qTable = new Map();
    this.visitCounts = new Map();
    this.episodesTrained = 0;
    this.lastUpdated = new Date();
  }

  /**
   * Get Q-table size (number of state-action pairs).
   */
  getTableSize(): { states: number; pairs: number } {
    let pairs = 0;
    Array.from(this.qTable.values()).forEach((actionValues) => {
      pairs += actionValues.size;
    });
    return { states: this.qTable.size, pairs };
  }

  /**
   * Get visit count for state-action pair.
   */
  getVisitCount(state: RLState, action: RLAction): number {
    const stateKey = discretizeState(state);
    const stateVisits = this.visitCounts.get(stateKey);
    if (!stateVisits) return 0;
    return stateVisits.get(action) || 0;
  }

  /**
   * Set configuration (e.g., for decaying epsilon).
   */
  setConfig(config: Partial<QLearningConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get Q-values for a specific state.
   */
  getQValues(state: RLState): Map<RLAction, number> {
    const stateKey = discretizeState(state);
    const stateQ = this.qTable.get(stateKey);
    if (!stateQ) return new Map();
    return new Map(stateQ);
  }
}
