/**
 * Unified Agent
 *
 * Single agent implementation that works in both voice and text modes.
 * FSM drives the agent, ensuring compliance.
 * Supports autonomous and RL-controlled policy modes.
 */

import type { FSMState, Intent, UserSignal } from "../types";
import type { RLState, RLAction, Learner } from "../../rl/types";
import { FSMEngine, STATE_ALLOWED_INTENTS } from "../engine/fsm";
import { buildAgentInstructions, buildIntentInjection } from "../voice/prompts";
import { extractState, createInitialState, type SessionContext } from "../../rl/environment/state-extractor";
import type {
  AgentConfig,
  AgentIO,
  AgentCallbacks,
  TurnResult,
  SessionResult,
  PolicyMode,
} from "./types";
import { TextIO } from "./io/text-io";
import { VoiceIO } from "./io/voice-io";

export class UnifiedAgent {
  private config: AgentConfig;
  private fsm: FSMEngine;
  private io: AgentIO;
  private callbacks: AgentCallbacks;

  private conversationHistory: Array<{ role: "agent" | "borrower"; text: string }>;
  private signalHistory: UserSignal[];
  private actionHistory: RLAction[];
  private turnCount: number;
  private currentRLState: RLState;

  constructor(config: AgentConfig, callbacks: AgentCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
    this.fsm = new FSMEngine("OPENING");

    // Initialize I/O based on mode
    const systemPrompt = buildAgentInstructions(config.caseData, config.policyConfig);

    if (config.mode === "voice") {
      this.io = new VoiceIO({ instructions: systemPrompt });
    } else {
      this.io = new TextIO({ systemPrompt });
    }

    // Initialize state
    this.conversationHistory = [];
    this.signalHistory = [];
    this.actionHistory = [];
    this.turnCount = 0;
    this.currentRLState = createInitialState(config.caseData);
  }

  /**
   * Connect to I/O (Realtime API or Chat API)
   */
  async connect(): Promise<void> {
    await this.io.connect();
  }

  /**
   * Disconnect from I/O
   */
  async disconnect(): Promise<void> {
    await this.io.disconnect();
  }

  /**
   * Process a turn: receive borrower message, select action, generate response
   */
  async processTurn(borrowerMessage: string): Promise<TurnResult> {
    this.turnCount++;
    this.conversationHistory.push({ role: "borrower", text: borrowerMessage });

    const fsmStateBefore = this.fsm.getCurrentState();
    const availableActions = this.getAvailableActions();

    // Detect signals from borrower message
    const detectedSignals = this.detectSignals(borrowerMessage);
    for (const signal of detectedSignals) {
      this.signalHistory.push(signal);
    }

    // Select action based on policy mode
    let action: RLAction;
    if (this.config.policyMode === "rl-controlled" && this.config.learner) {
      // RL learner selects action
      const observation = this.buildObservation(fsmStateBefore, borrowerMessage);
      action = this.config.learner.selectAction(observation, availableActions);
    } else {
      // Autonomous: decide based on FSM state and context
      action = await this.decideAction(fsmStateBefore, borrowerMessage, availableActions);
    }

    this.actionHistory.push(action);

    // Generate utterance for the selected action
    const agentUtterance = await this.generateUtterance(action, fsmStateBefore);
    this.conversationHistory.push({ role: "agent", text: agentUtterance });

    // Execute FSM transition
    const transition = this.executeTransition(action, detectedSignals);
    const fsmStateAfter = this.fsm.getCurrentState();

    // Update RL state
    this.updateRLState();

    // Notify callbacks
    if (transition && fsmStateBefore !== fsmStateAfter) {
      this.callbacks.onStateChange?.(fsmStateBefore, fsmStateAfter);
    }

    const result: TurnResult = {
      agentUtterance,
      action,
      fsmState: fsmStateAfter,
      fsmTransition: transition ? {
        from: fsmStateBefore,
        to: fsmStateAfter,
        wasForced: transition.wasForced,
        reason: transition.reason,
      } : null,
    };

    this.callbacks.onTurnComplete?.(result);
    return result;
  }

  /**
   * Get available actions for current FSM state
   */
  getAvailableActions(): RLAction[] {
    const fsmState = this.fsm.getCurrentState();
    return (STATE_ALLOWED_INTENTS[fsmState] || ["PROCEED"]) as RLAction[];
  }

  /**
   * Get current FSM state
   */
  getFSMState(): FSMState {
    return this.fsm.getCurrentState();
  }

  /**
   * Get current RL state observation
   */
  getRLState(): RLState {
    return this.currentRLState;
  }

  /**
   * Check if conversation has ended
   */
  isTerminal(): boolean {
    const state = this.fsm.getCurrentState();
    return state === "END_CALL" ||
           state === "DO_NOT_CALL" ||
           state === "WRONG_PARTY_FLOW" ||
           state === "ESCALATE_HUMAN";
  }

  /**
   * Reset agent for new conversation
   */
  reset(): void {
    this.fsm.reset();
    this.conversationHistory = [];
    this.signalHistory = [];
    this.actionHistory = [];
    this.turnCount = 0;
    this.currentRLState = createInitialState(this.config.caseData);
  }

  /**
   * Decide action autonomously based on FSM state and context
   */
  private async decideAction(
    fsmState: FSMState,
    borrowerMessage: string,
    availableActions: RLAction[]
  ): Promise<RLAction> {
    // Simple heuristic for autonomous mode
    // In a full implementation, this could use LLM to decide

    const lowerMessage = borrowerMessage.toLowerCase();

    // Check for specific borrower signals
    if (lowerMessage.includes("yes") || lowerMessage.includes("okay") || lowerMessage.includes("sure")) {
      if (availableActions.includes("PROCEED")) return "PROCEED";
      if (availableActions.includes("CONFIRM_IDENTITY")) return "CONFIRM_IDENTITY";
      if (availableActions.includes("CONFIRM_PLAN")) return "CONFIRM_PLAN";
    }

    if (lowerMessage.includes("no") || lowerMessage.includes("can't") || lowerMessage.includes("don't")) {
      if (availableActions.includes("EMPATHIZE")) return "EMPATHIZE";
      if (availableActions.includes("HANDLE_PUSHBACK")) return "HANDLE_PUSHBACK";
    }

    if (lowerMessage.includes("?") || lowerMessage.includes("what") || lowerMessage.includes("how")) {
      if (availableActions.includes("ASK_CLARIFY")) return "ASK_CLARIFY";
    }

    if (fsmState === "NEGOTIATION") {
      if (availableActions.includes("OFFER_PLAN")) return "OFFER_PLAN";
    }

    // Default to PROCEED if available
    if (availableActions.includes("PROCEED")) return "PROCEED";

    // Otherwise return first available action
    return availableActions[0] || "PROCEED";
  }

  /**
   * Generate utterance for an action using LLM
   */
  private async generateUtterance(action: RLAction, fsmState: FSMState): Promise<string> {
    if (this.config.mode === "text" && this.io instanceof TextIO) {
      // Use TextIO's LLM generation
      const lastBorrowerMsg = this.conversationHistory
        .filter(m => m.role === "borrower")
        .pop()?.text || "";

      return await this.io.generateResponse(lastBorrowerMsg, action);
    }

    // For voice mode or fallback, use template
    return this.getTemplateUtterance(action, fsmState);
  }

  /**
   * Template-based utterance generation (fallback)
   */
  private getTemplateUtterance(action: RLAction, state: FSMState): string {
    const { caseData } = this.config;

    const templates: Record<string, string> = {
      "OPENING:PROCEED": `Hello, may I speak with ${caseData.debtorName}?`,
      "DISCLOSURE:IDENTIFY_SELF": `This is a call from ${caseData.creditorName}. My name is Sarah and I'm calling about your account.`,
      "DISCLOSURE:PROCEED": "This is an attempt to collect a debt. Any information obtained will be used for that purpose.",
      "IDENTITY_VERIFICATION:ASK_VERIFICATION": "For security, can you please confirm the last four digits of your Social Security number?",
      "IDENTITY_VERIFICATION:CONFIRM_IDENTITY": "Thank you for confirming. I've verified your identity.",
      "NEGOTIATION:EMPATHIZE": "I understand that money can be tight. Let's see what options we can work out.",
      "NEGOTIATION:OFFER_PLAN": `We can set up a payment plan. Would you be able to pay $${(caseData.amountDue / 3).toFixed(2)} per month?`,
      "WRAPUP:SUMMARIZE": "To summarize, we've discussed your account. Is there anything else I can help with?",
      "WRAPUP:PROCEED": "Thank you for your time today. Have a great day.",
    };

    const key = `${state}:${action}`;
    return templates[key] || `[${action} in ${state}]`;
  }

  /**
   * Detect user signals from message
   */
  private detectSignals(message: string): UserSignal[] {
    const signals: UserSignal[] = [];
    const lower = message.toLowerCase();

    if (lower.includes("stop calling") || lower.includes("do not call") || lower.includes("don't call")) {
      signals.push("STOP_CONTACT");
    }
    if (lower.includes("dispute") || lower.includes("not my debt") || lower.includes("don't owe")) {
      signals.push("DISPUTE");
    }
    if (lower.includes("wrong number") || lower.includes("wrong person") || lower.includes("not me")) {
      signals.push("WRONG_PARTY");
    }
    if (lower.includes("yes") || lower.includes("okay") || lower.includes("agree")) {
      signals.push("AGREEMENT");
    }
    if (lower.includes("no") || lower.includes("can't") || lower.includes("won't")) {
      signals.push("REFUSAL");
    }

    return signals;
  }

  /**
   * Execute FSM transition based on action and signals
   */
  private executeTransition(action: RLAction, signals: UserSignal[]) {
    // Check for forced transitions from signals
    const forcedState = this.fsm.checkForcedTransition(signals);

    if (forcedState) {
      return this.fsm.forceTransition(forcedState, `Signal: ${signals.join(", ")}`);
    }

    // Check if action should advance state
    if (this.shouldAdvanceState(action, signals)) {
      return this.fsm.transition(signals);
    }

    return null;
  }

  /**
   * Determine if action should advance FSM state
   */
  private shouldAdvanceState(action: RLAction, signals: UserSignal[]): boolean {
    const state = this.fsm.getCurrentState();

    const advancingActions: Record<string, RLAction[]> = {
      OPENING: ["PROCEED"],
      DISCLOSURE: ["IDENTIFY_SELF", "PROCEED"],
      CONSENT_RECORDING: ["PROCEED"],
      DEBT_CONTEXT: ["PROCEED"],
      NEGOTIATION: ["PROCEED", "REQUEST_CALLBACK"],
      PAYMENT_SETUP: ["SEND_PAYMENT_LINK", "PROCEED"],
      WRAPUP: ["PROCEED"],
    };

    const actionsForState = advancingActions[state] || [];
    if (actionsForState.includes(action)) {
      return true;
    }

    if (signals.includes("AGREEMENT")) {
      return true;
    }

    return false;
  }

  /**
   * Build observation for RL learner
   */
  private buildObservation(fsmState: FSMState, borrowerMessage: string): RLState {
    const sessionContext: SessionContext = {
      fsmContext: this.fsm.getContext(),
      caseData: this.config.caseData,
      messages: this.conversationHistory.map((m, i) => ({
        id: String(i),
        role: m.role === "agent" ? "agent" as const : "user" as const,
        text: m.text,
        timestamp: new Date(),
      })),
      signalHistory: this.signalHistory,
      actionHistory: this.actionHistory,
      turnCount: this.turnCount,
    };

    return extractState(sessionContext);
  }

  /**
   * Update current RL state
   */
  private updateRLState(): void {
    const sessionContext: SessionContext = {
      fsmContext: this.fsm.getContext(),
      caseData: this.config.caseData,
      messages: this.conversationHistory.map((m, i) => ({
        id: String(i),
        role: m.role === "agent" ? "agent" as const : "user" as const,
        text: m.text,
        timestamp: new Date(),
      })),
      signalHistory: this.signalHistory,
      actionHistory: this.actionHistory,
      turnCount: this.turnCount,
    };

    this.currentRLState = extractState(sessionContext);
  }
}
