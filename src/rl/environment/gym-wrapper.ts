/**
 * Gym-style Environment Wrapper
 *
 * Provides reset() / step() interface for RL training.
 * Integrates FSM, borrower simulator, and reward calculator.
 */

import type { CaseData, FSMState, UserSignal, Intent } from "../../lib/types";
import { FSMEngine, STATE_ALLOWED_INTENTS } from "../../lib/engine/fsm";
import type {
  RLState,
  RLAction,
  StepResult,
  StepInfo,
  TerminalReason,
  Trajectory,
  Transition,
  PersonaConfig,
  EnvironmentConfig,
  BorrowerResponse,
} from "../types";
import { DEFAULT_ENV_CONFIG } from "../types";
import {
  extractState,
  createInitialState,
  SessionContext,
} from "./state-extractor";
import {
  RewardCalculator,
  isTerminalState,
  determineTerminalReason,
} from "./reward";
import { BorrowerSimulator, LLMClient } from "../simulator/borrower";
import { samplePersona } from "../simulator/personas";

/**
 * Agent utterance generator interface.
 * Given a chosen intent, generates natural language for that intent.
 */
export interface AgentUtteranceGenerator {
  generate(intent: RLAction, state: FSMState, context: AgentContext): Promise<string>;
}

/**
 * Context for agent utterance generation.
 */
export interface AgentContext {
  caseData: CaseData;
  conversationHistory: Array<{ role: "agent" | "borrower"; text: string }>;
  slots: Record<string, string | number | boolean>;
}

/**
 * Simple template-based utterance generator.
 * Uses predefined templates per intent/state.
 */
export class TemplateUtteranceGenerator implements AgentUtteranceGenerator {
  private caseData: CaseData;

  constructor(caseData: CaseData) {
    this.caseData = caseData;
  }

  async generate(
    intent: RLAction,
    state: FSMState,
    _context: AgentContext
  ): Promise<string> {
    const templates = this.getTemplates(state, intent);
    const template = templates[Math.floor(Math.random() * templates.length)];
    return this.fillTemplate(template);
  }

  private getTemplates(state: FSMState, intent: Intent): string[] {
    const key = `${state}:${intent}`;

    const templates: Record<string, string[]> = {
      // Opening
      "OPENING:PROCEED": [
        `Hello, may I speak with ${this.caseData.debtorName}?`,
        `Hi, is this ${this.caseData.debtorName}?`,
      ],
      "OPENING:ASK_CLARIFY": [
        "I'm sorry, I didn't catch that. Is this the right number?",
        "Could you please confirm your name?",
      ],
      "OPENING:HANDLE_PUSHBACK": [
        "I understand you're busy. This will only take a moment.",
        "I appreciate your time. This is an important matter.",
      ],

      // Disclosure
      "DISCLOSURE:IDENTIFY_SELF": [
        `This is a call from ${this.caseData.creditorName}. My name is Alex and I'm calling about your account.`,
        `I'm calling from ${this.caseData.creditorName} regarding your account.`,
      ],
      "DISCLOSURE:PROCEED": [
        "This is an attempt to collect a debt. Any information obtained will be used for that purpose.",
      ],

      // Identity Verification
      "IDENTITY_VERIFICATION:ASK_VERIFICATION": [
        "For security, can you please confirm the last four digits of your Social Security number?",
        "To verify your identity, what is your date of birth?",
      ],
      "IDENTITY_VERIFICATION:CONFIRM_IDENTITY": [
        "Thank you for confirming. I've verified your identity.",
        "Perfect, that matches our records.",
      ],

      // Consent Recording
      "CONSENT_RECORDING:PROCEED": [
        "This call may be recorded for quality and training purposes. Do you consent to being recorded?",
      ],

      // Debt Context
      "DEBT_CONTEXT:PROCEED": [
        `I'm calling about your outstanding balance of $${this.caseData.amountDue.toFixed(2)} with ${this.caseData.creditorName}.`,
      ],
      "DEBT_CONTEXT:EMPATHIZE": [
        "I understand this may be unexpected. Let me explain the details.",
      ],

      // Negotiation
      "NEGOTIATION:EMPATHIZE": [
        "I understand that money can be tight. Let's see what options we can work out.",
        "I hear you. Many people are in similar situations. Let's find a solution together.",
      ],
      "NEGOTIATION:OFFER_PLAN": [
        `We can set up a payment plan. Would you be able to pay $${(this.caseData.amountDue / 3).toFixed(2)} per month?`,
        `How about we split this into manageable payments? We could do $${(this.caseData.amountDue / 6).toFixed(2)} monthly.`,
      ],
      "NEGOTIATION:COUNTER_OFFER": [
        "I understand that might be difficult. What amount would work better for you?",
        "Let me see if we can adjust that. What can you comfortably afford?",
      ],
      "NEGOTIATION:REQUEST_CALLBACK": [
        "I understand now isn't a good time. When would be better to discuss this?",
        "No problem. Should I call back tomorrow or later this week?",
      ],
      "NEGOTIATION:HANDLE_PUSHBACK": [
        "I understand your concerns. Let me address them.",
      ],
      "NEGOTIATION:PROCEED": [
        "Great, let's move forward with setting this up.",
      ],

      // Payment Setup
      "PAYMENT_SETUP:CONFIRM_PLAN": [
        "So we're agreeing to the payment plan we discussed. Is that correct?",
      ],
      "PAYMENT_SETUP:SEND_PAYMENT_LINK": [
        "I'll send you a link to complete the payment. You should receive it shortly.",
      ],
      "PAYMENT_SETUP:PROCEED": [
        "Everything is set up. Your first payment will be due on the date we discussed.",
      ],

      // Wrapup
      "WRAPUP:SUMMARIZE": [
        "To summarize, we've agreed on a payment plan. You'll receive confirmation shortly.",
        "Thank you for working with us today. Is there anything else I can help with?",
      ],
      "WRAPUP:PROCEED": [
        "Thank you for your time today. Have a great day.",
      ],

      // Dispute Flow
      "DISPUTE_FLOW:ACKNOWLEDGE_DISPUTE": [
        "I understand you're disputing this debt. I'll make a note of that and we'll send you verification.",
      ],
      "DISPUTE_FLOW:EMPATHIZE": [
        "I understand your concern. Let's sort this out.",
      ],
      "DISPUTE_FLOW:PROCEED": [
        "We'll send you the documentation. Thank you for your time.",
      ],

      // Wrong Party
      "WRONG_PARTY_FLOW:APOLOGIZE": [
        "I apologize for the confusion. We'll update our records.",
      ],
      "WRONG_PARTY_FLOW:PROCEED": [
        "Sorry for the inconvenience. Have a good day.",
      ],

      // DNC
      "DO_NOT_CALL:ACKNOWLEDGE_DNC": [
        "I've noted your request. You won't receive any more calls from us.",
      ],
      "DO_NOT_CALL:PROCEED": [
        "Your number has been added to our do-not-call list. Goodbye.",
      ],

      // Escalate
      "ESCALATE_HUMAN:ESCALATE": [
        "I'll transfer you to a supervisor who can better assist you.",
      ],
      "ESCALATE_HUMAN:PROCEED": [
        "Please hold while I connect you.",
      ],

      // End Call
      "END_CALL:SUMMARIZE": [
        "Thank you for your time. Goodbye.",
      ],
    };

    return templates[key] || [`[${intent} in ${state}]`];
  }

  private fillTemplate(template: string): string {
    return template
      .replace(/\{debtorName\}/g, this.caseData.debtorName)
      .replace(/\{creditorName\}/g, this.caseData.creditorName)
      .replace(/\{amountDue\}/g, this.caseData.amountDue.toFixed(2));
  }
}

/**
 * LLM-based utterance generator.
 * Uses an LLM to generate more natural varied responses.
 */
export class LLMUtteranceGenerator implements AgentUtteranceGenerator {
  private llmClient: LLMClient;
  private caseData: CaseData;

  constructor(llmClient: LLMClient, caseData: CaseData) {
    this.llmClient = llmClient;
    this.caseData = caseData;
  }

  async generate(
    intent: RLAction,
    state: FSMState,
    context: AgentContext
  ): Promise<string> {
    const systemPrompt = `You are a debt collection agent speaking to a debtor.
Be professional, empathetic, and compliant. Keep responses brief (1-2 sentences).
Current state: ${state}
Intent to express: ${intent}
Debtor name: ${this.caseData.debtorName}
Creditor: ${this.caseData.creditorName}
Amount: $${this.caseData.amountDue.toFixed(2)}`;

    const recentHistory = context.conversationHistory.slice(-4);
    let userPrompt = "Generate the agent's next response.\n\n";

    if (recentHistory.length > 0) {
      userPrompt += "Recent conversation:\n";
      for (const turn of recentHistory) {
        const speaker = turn.role === "agent" ? "Agent" : "Borrower";
        userPrompt += `${speaker}: ${turn.text}\n`;
      }
    }

    userPrompt += `\nIntent: ${intent}\nAgent says:`;

    try {
      return await this.llmClient.complete(userPrompt, systemPrompt);
    } catch {
      // Fallback to template
      const fallback = new TemplateUtteranceGenerator(this.caseData);
      return fallback.generate(intent, state, context);
    }
  }
}

/**
 * Gym-style RL Environment for debt collection.
 */
export class DebtCollectionEnv {
  private config: EnvironmentConfig;
  private fsm: FSMEngine;
  private caseData: CaseData;
  private borrowerSim: BorrowerSimulator;
  private utteranceGen: AgentUtteranceGenerator;
  private rewardCalc: RewardCalculator;

  private currentPersona: PersonaConfig;
  private conversationHistory: Array<{ role: "agent" | "borrower"; text: string }>;
  private signalHistory: UserSignal[];
  private actionHistory: RLAction[];
  private turnCount: number;
  private trajectory: Transition[];
  private currentState: RLState;
  private done: boolean;

  constructor(
    borrowerLLM: LLMClient,
    caseData: CaseData,
    config: EnvironmentConfig = DEFAULT_ENV_CONFIG,
    agentLLM?: LLMClient
  ) {
    this.config = config;
    this.caseData = caseData;
    this.borrowerSim = new BorrowerSimulator(borrowerLLM, samplePersona());
    this.rewardCalc = new RewardCalculator(config.rewardConfig);

    // Use LLM or template-based utterance generator
    if (agentLLM) {
      this.utteranceGen = new LLMUtteranceGenerator(agentLLM, caseData);
    } else {
      this.utteranceGen = new TemplateUtteranceGenerator(caseData);
    }

    // Initialize state
    this.fsm = new FSMEngine("OPENING");
    this.currentPersona = samplePersona();
    this.conversationHistory = [];
    this.signalHistory = [];
    this.actionHistory = [];
    this.turnCount = 0;
    this.trajectory = [];
    this.currentState = createInitialState(caseData);
    this.done = false;
  }

  /**
   * Reset environment for new episode.
   */
  reset(persona?: PersonaConfig): RLState {
    // Set persona
    this.currentPersona = persona || samplePersona();
    this.borrowerSim.reset(this.currentPersona);

    // Reset FSM
    this.fsm.reset();

    // Reset tracking
    this.conversationHistory = [];
    this.signalHistory = [];
    this.actionHistory = [];
    this.turnCount = 0;
    this.trajectory = [];
    this.done = false;

    // Reset reward calculator
    this.rewardCalc.reset();

    // Create initial state
    this.currentState = createInitialState(this.caseData);

    return this.currentState;
  }

  /**
   * Take a step in the environment.
   */
  async step(action: RLAction): Promise<StepResult> {
    if (this.done) {
      throw new Error("Episode is done. Call reset() to start a new episode.");
    }

    const prevState = { ...this.currentState };
    const fsmStateBefore = this.fsm.getCurrentState();

    // Validate action is allowed
    const allowedActions = this.getAllowedActions();
    if (!allowedActions.includes(action)) {
      throw new Error(
        `Action ${action} not allowed in state ${fsmStateBefore}. Allowed: ${allowedActions.join(", ")}`
      );
    }

    this.actionHistory.push(action);
    this.turnCount++;

    // Generate agent utterance for chosen action
    const agentContext: AgentContext = {
      caseData: this.caseData,
      conversationHistory: this.conversationHistory,
      slots: this.fsm.getContext().slots,
    };
    const agentUtterance = await this.utteranceGen.generate(
      action,
      fsmStateBefore,
      agentContext
    );

    this.conversationHistory.push({ role: "agent", text: agentUtterance });

    // Get borrower response
    const borrowerResponse = await this.borrowerSim.respond(agentUtterance);
    this.conversationHistory.push({ role: "borrower", text: borrowerResponse.text });

    // Track signals
    const detectedSignals: UserSignal[] = [];
    if (borrowerResponse.detectedSignal) {
      detectedSignals.push(borrowerResponse.detectedSignal);
      this.signalHistory.push(borrowerResponse.detectedSignal);
    }

    // Check for forced transitions from signals
    const forcedState = this.fsm.checkForcedTransition(detectedSignals);
    let fsmStateAfter = fsmStateBefore;
    let wasForced = false;
    let transitionReason = "No transition";

    if (forcedState) {
      this.fsm.forceTransition(forcedState, `Signal: ${detectedSignals.join(", ")}`);
      fsmStateAfter = forcedState;
      wasForced = true;
      transitionReason = `Forced by signal: ${detectedSignals.join(", ")}`;
    } else if (borrowerResponse.shouldHangup) {
      // Borrower hung up - force to END_CALL
      this.fsm.forceTransition("END_CALL", "Borrower hangup");
      fsmStateAfter = "END_CALL";
      wasForced = true;
      transitionReason = "Borrower hangup";
    } else if (this.shouldAdvanceState(action, detectedSignals)) {
      // Standard transition
      const transition = this.fsm.transition(detectedSignals);
      fsmStateAfter = transition.newState;
      transitionReason = transition.reason;
    }

    // Update slots
    this.updateSlots(action, borrowerResponse.text, fsmStateAfter);

    // Extract new state
    const sessionContext: SessionContext = {
      fsmContext: this.fsm.getContext(),
      caseData: this.caseData,
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
    const newState = extractState(sessionContext);
    this.currentState = newState;

    // Check if episode is done
    const maxTurnsReached = this.turnCount >= this.config.maxTurnsPerEpisode;
    const isTerminal = isTerminalState(fsmStateAfter);
    this.done = isTerminal || maxTurnsReached || borrowerResponse.shouldHangup;

    // Determine terminal reason
    let terminalReason: TerminalReason | null = null;
    if (this.done) {
      if (borrowerResponse.shouldHangup) {
        terminalReason = newState.disclosureComplete
          ? "BORROWER_HANGUP"
          : "BORROWER_HANGUP";
      } else {
        terminalReason = determineTerminalReason(newState, detectedSignals, maxTurnsReached);
      }

      // Check for successful outcomes
      if (fsmStateAfter === "PAYMENT_SETUP" || action === "SEND_PAYMENT_LINK") {
        terminalReason = "PAYMENT_SETUP_COMPLETE";
      } else if (fsmStateAfter === "CALLBACK_SCHEDULED" || action === "REQUEST_CALLBACK") {
        terminalReason = "CALLBACK_SCHEDULED";
      }
    }

    // Calculate reward
    const rewardBreakdown = this.rewardCalc.calculate(
      prevState,
      action,
      newState,
      detectedSignals,
      terminalReason
    );

    // Build step info
    const info: StepInfo = {
      fsmTransition: {
        from: fsmStateBefore,
        to: fsmStateAfter,
        wasForced,
        reason: transitionReason,
      },
      agentUtterance,
      borrowerResponse: borrowerResponse.text,
      detectedSignals,
      terminalReason: terminalReason || undefined,
      rewardBreakdown,
    };

    // Record transition
    const transition: Transition = {
      state: prevState,
      action,
      reward: rewardBreakdown.total,
      nextState: newState,
      done: this.done,
      info,
    };
    this.trajectory.push(transition);

    return {
      state: newState,
      reward: rewardBreakdown.total,
      done: this.done,
      info,
    };
  }

  /**
   * Get allowed actions for current state.
   */
  getAllowedActions(): RLAction[] {
    const fsmState = this.fsm.getCurrentState();
    return (STATE_ALLOWED_INTENTS[fsmState] || ["PROCEED"]) as RLAction[];
  }

  /**
   * Get current state.
   */
  getCurrentState(): RLState {
    return this.currentState;
  }

  /**
   * Get current FSM state.
   */
  getFSMState(): FSMState {
    return this.fsm.getCurrentState();
  }

  /**
   * Get episode trajectory.
   */
  getTrajectory(): Trajectory {
    const totalReturn = this.trajectory.reduce((sum, t) => sum + t.reward, 0);
    const outcome = this.trajectory.length > 0
      ? this.trajectory[this.trajectory.length - 1].info.terminalReason || "END_CALL_REACHED"
      : "END_CALL_REACHED";

    return {
      transitions: this.trajectory,
      totalReturn,
      length: this.trajectory.length,
      outcome,
      persona: this.currentPersona,
    };
  }

  /**
   * Get current persona.
   */
  getPersona(): PersonaConfig {
    return this.currentPersona;
  }

  /**
   * Check if episode is done.
   */
  isDone(): boolean {
    return this.done;
  }

  /**
   * Determine if FSM should advance based on action and signals.
   */
  private shouldAdvanceState(action: RLAction, signals: UserSignal[]): boolean {
    const state = this.fsm.getCurrentState();

    // Certain actions always advance
    const advancingActions: Record<string, RLAction[]> = {
      OPENING: ["PROCEED"],
      DISCLOSURE: ["IDENTIFY_SELF", "PROCEED"],
      IDENTITY_VERIFICATION: ["CONFIRM_IDENTITY"],
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

    // Positive signals can also advance
    if (signals.includes("AGREEMENT")) {
      return true;
    }

    return false;
  }

  /**
   * Update FSM slots based on action and response.
   */
  private updateSlots(action: RLAction, borrowerText: string, newState: FSMState): void {
    const fsm = this.fsm;

    // Track identity verification
    if (action === "CONFIRM_IDENTITY") {
      fsm.setSlot("identity_verified", true);
    }

    // Track disclosure
    if (newState === "DEBT_CONTEXT" || newState === "NEGOTIATION") {
      fsm.setSlot("disclosure_complete", true);
    }

    // Track offers
    if (action === "OFFER_PLAN" || action === "COUNTER_OFFER") {
      const currentOffers = (fsm.getSlot("offers_made") as number) || 0;
      fsm.setSlot("offers_made", currentOffers + 1);
    }

    // Track agreement
    if (/yes|agree|okay|deal|sounds good/i.test(borrowerText)) {
      fsm.setSlot("last_response_positive", true);
    } else {
      fsm.setSlot("last_response_positive", false);
    }
  }
}

/**
 * Factory function to create environment.
 */
export function createEnvironment(
  borrowerLLM: LLMClient,
  caseData: CaseData,
  config?: EnvironmentConfig,
  agentLLM?: LLMClient
): DebtCollectionEnv {
  return new DebtCollectionEnv(borrowerLLM, caseData, config, agentLLM);
}

/**
 * Create a simple test case for experiments.
 */
export function createTestCase(): CaseData {
  return {
    id: "test-001",
    debtorName: "John Smith",
    debtorPhone: "555-123-4567",
    creditorName: "ABC Collections",
    amountDue: 2500.0,
    daysPastDue: 90,
    jurisdiction: "CA",
    timezone: "America/Los_Angeles",
    language: "en",
    dnc: false,
    disputed: false,
    wrongParty: false,
    recordingConsent: null,
    identityVerified: null,
    attemptCountToday: 0,
    attemptCountTotal: 2,
  };
}
