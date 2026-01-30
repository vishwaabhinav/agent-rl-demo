/**
 * Baseline Policies
 *
 * Non-learning policies for comparison:
 * - RandomPolicy: Uniform random action selection
 * - FixedScriptPolicy: Always picks first allowed action (deterministic script)
 */

import type {
  RLState,
  RLAction,
  PolicySnapshot,
  DiscreteStateKey,
} from "../types";
import { BaseLearner } from "./base";
import { discretizeState } from "../environment/state-extractor";

/**
 * Random policy - uniform random action selection.
 * Establishes floor performance.
 */
export class RandomPolicy extends BaseLearner {
  selectAction(_state: RLState, allowedActions: RLAction[]): RLAction {
    const index = Math.floor(Math.random() * allowedActions.length);
    return allowedActions[index];
  }

  update(
    _state: RLState,
    _action: RLAction,
    _reward: number,
    _nextState: RLState | null,
    done: boolean
  ): void {
    // No learning - just track episodes
    if (done) {
      this.incrementEpisode();
    }
  }

  getPolicy(): PolicySnapshot {
    return {
      type: "bandit", // Use bandit type for visualization compatibility
      greedyPolicy: new Map(), // No greedy policy - random
      ...this.getBaseMetadata(),
    };
  }

  save(): string {
    return JSON.stringify({
      type: "random",
      episodesTrained: this.episodesTrained,
      lastUpdated: this.lastUpdated.toISOString(),
    });
  }

  load(jsonData: string): void {
    const data = JSON.parse(jsonData);
    this.episodesTrained = data.episodesTrained;
    this.lastUpdated = new Date(data.lastUpdated);
  }

  reset(): void {
    this.episodesTrained = 0;
    this.lastUpdated = new Date();
  }
}

/**
 * Fixed script policy - always picks first allowed action.
 * Represents deterministic FSM behavior without learning.
 */
export class FixedScriptPolicy extends BaseLearner {
  selectAction(_state: RLState, allowedActions: RLAction[]): RLAction {
    // Always pick first action (deterministic)
    return allowedActions[0];
  }

  update(
    _state: RLState,
    _action: RLAction,
    _reward: number,
    _nextState: RLState | null,
    done: boolean
  ): void {
    // No learning - just track episodes
    if (done) {
      this.incrementEpisode();
    }
  }

  getPolicy(): PolicySnapshot {
    // Build greedy policy (first action for each state)
    const greedyPolicy = new Map<DiscreteStateKey, RLAction>();

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

    // Create representative state keys for each FSM state
    for (const [fsmState, actions] of Object.entries(stateActions)) {
      const stateKey = `fsm:${fsmState}|turn:5|tis:2|debt:MEDIUM|dpd:60|prior:1|id:1|disc:1|sig:none|sent:NEUTRAL|obj:0|off:0`;
      greedyPolicy.set(stateKey as DiscreteStateKey, actions[0]);
    }

    return {
      type: "bandit",
      greedyPolicy,
      ...this.getBaseMetadata(),
    };
  }

  save(): string {
    return JSON.stringify({
      type: "fixed_script",
      episodesTrained: this.episodesTrained,
      lastUpdated: this.lastUpdated.toISOString(),
    });
  }

  load(jsonData: string): void {
    const data = JSON.parse(jsonData);
    this.episodesTrained = data.episodesTrained;
    this.lastUpdated = new Date(data.lastUpdated);
  }

  reset(): void {
    this.episodesTrained = 0;
    this.lastUpdated = new Date();
  }
}

/**
 * Heuristic policy - uses simple rules based on state.
 * More sophisticated than fixed script but still no learning.
 */
export class HeuristicPolicy extends BaseLearner {
  selectAction(state: RLState, allowedActions: RLAction[]): RLAction {
    // Simple heuristics based on state

    // In negotiation: prioritize empathy if objections, else offer plan
    if (state.fsmState === "NEGOTIATION") {
      if (state.objectionsRaised > 0 && allowedActions.includes("EMPATHIZE")) {
        return "EMPATHIZE";
      }
      if (state.sentiment === "POSITIVE" && allowedActions.includes("OFFER_PLAN")) {
        return "OFFER_PLAN";
      }
      if (state.offersMade > 0 && allowedActions.includes("COUNTER_OFFER")) {
        return "COUNTER_OFFER";
      }
      if (allowedActions.includes("OFFER_PLAN")) {
        return "OFFER_PLAN";
      }
    }

    // In identity verification: confirm if identity seems verified
    if (state.fsmState === "IDENTITY_VERIFICATION") {
      if (state.lastSignal === "AGREEMENT" && allowedActions.includes("CONFIRM_IDENTITY")) {
        return "CONFIRM_IDENTITY";
      }
      if (allowedActions.includes("ASK_VERIFICATION")) {
        return "ASK_VERIFICATION";
      }
    }

    // In payment setup: send link if plan confirmed
    if (state.fsmState === "PAYMENT_SETUP") {
      if (allowedActions.includes("SEND_PAYMENT_LINK")) {
        return "SEND_PAYMENT_LINK";
      }
      if (allowedActions.includes("CONFIRM_PLAN")) {
        return "CONFIRM_PLAN";
      }
    }

    // Default: pick first action
    return allowedActions[0];
  }

  update(
    _state: RLState,
    _action: RLAction,
    _reward: number,
    _nextState: RLState | null,
    done: boolean
  ): void {
    if (done) {
      this.incrementEpisode();
    }
  }

  getPolicy(): PolicySnapshot {
    return {
      type: "bandit",
      greedyPolicy: new Map(),
      ...this.getBaseMetadata(),
    };
  }

  save(): string {
    return JSON.stringify({
      type: "heuristic",
      episodesTrained: this.episodesTrained,
      lastUpdated: this.lastUpdated.toISOString(),
    });
  }

  load(jsonData: string): void {
    const data = JSON.parse(jsonData);
    this.episodesTrained = data.episodesTrained;
    this.lastUpdated = new Date(data.lastUpdated);
  }

  reset(): void {
    this.episodesTrained = 0;
    this.lastUpdated = new Date();
  }
}
