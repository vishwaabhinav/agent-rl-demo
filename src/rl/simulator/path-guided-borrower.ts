/**
 * Path-Guided Borrower Simulator
 *
 * Uses VoicePersona and FSM path from simulation module with text-based LLM.
 * Reuses borrower-fsm.ts and borrower-prompts.ts from simulation.
 */

import type { FSMState, UserSignal } from "../../lib/types";
import type { VoicePersona, BorrowerFSMState } from "../../simulation/types";
import type { LLMClient } from "./borrower";
import type { BorrowerResponse } from "../types";
import {
  initBorrowerFSM,
  advanceFSM,
  checkTransition,
  isPathComplete,
  getCurrentStateHint,
} from "../../simulation/borrower-fsm";
import {
  buildBorrowerInstructions,
  buildBorrowerStatePrompt,
} from "../../simulation/borrower-prompts";

/**
 * Detect signals from borrower response text.
 */
function detectSignals(text: string): UserSignal | undefined {
  const lowerText = text.toLowerCase();

  // Stop contact signals
  if (
    lowerText.includes("stop calling") ||
    lowerText.includes("don't call") ||
    lowerText.includes("do not call") ||
    lowerText.includes("leave me alone")
  ) {
    return "STOP_CONTACT";
  }

  // Dispute signals
  if (
    lowerText.includes("don't owe") ||
    lowerText.includes("not my debt") ||
    lowerText.includes("dispute") ||
    lowerText.includes("prove it")
  ) {
    return "DISPUTE";
  }

  // Wrong party signals
  if (
    lowerText.includes("wrong number") ||
    lowerText.includes("wrong person") ||
    lowerText.includes("not me")
  ) {
    return "WRONG_PARTY";
  }

  // Agreement signals
  if (
    lowerText.includes("i can pay") ||
    lowerText.includes("i'll pay") ||
    lowerText.includes("sounds good") ||
    lowerText.includes("that works") ||
    lowerText.includes("let's do it")
  ) {
    return "AGREEMENT";
  }

  // Refusal signals
  if (
    lowerText.includes("i can't pay") ||
    lowerText.includes("i won't pay") ||
    lowerText.includes("no way") ||
    lowerText.includes("not paying")
  ) {
    return "REFUSAL";
  }

  // Callback request
  if (
    lowerText.includes("call back") ||
    lowerText.includes("call me later") ||
    lowerText.includes("bad time")
  ) {
    return "CALLBACK_REQUEST";
  }

  // Hostility signals
  if (
    lowerText.includes("scam") ||
    lowerText.includes("fraud") ||
    lowerText.includes("sue you")
  ) {
    return "HOSTILITY";
  }

  return undefined;
}

/**
 * Check if response indicates hangup.
 */
function detectHangup(text: string): boolean {
  const lowerText = text.toLowerCase();
  return (
    lowerText.includes("hanging up") ||
    lowerText.includes("i'm done") ||
    lowerText.includes("goodbye") ||
    lowerText.includes("*click*") ||
    lowerText.includes("end this call")
  );
}

/**
 * Path-guided borrower that follows VoicePersona FSM path.
 */
export class PathGuidedBorrower {
  private llmClient: LLMClient;
  private persona: VoicePersona;
  private fsmState: BorrowerFSMState;
  private systemPrompt: string;
  private conversationHistory: Array<{ role: "agent" | "borrower"; text: string }>;
  private currentAgentState: FSMState;

  constructor(llmClient: LLMClient, persona: VoicePersona) {
    this.llmClient = llmClient;
    this.persona = persona;
    this.fsmState = initBorrowerFSM(persona);
    this.systemPrompt = buildBorrowerInstructions(persona);
    this.conversationHistory = [];
    this.currentAgentState = "OPENING";
  }

  /**
   * Get borrower response to agent utterance.
   * Updates FSM state based on agent's state transitions.
   */
  async respond(agentUtterance: string, agentState: FSMState): Promise<BorrowerResponse> {
    // Check if agent state changed and update borrower FSM
    if (agentState !== this.currentAgentState) {
      const transition = checkTransition(this.fsmState, agentState);
      if (transition.shouldAdvance) {
        this.fsmState = advanceFSM(this.fsmState);
      }
      this.currentAgentState = agentState;
    }

    // Build state-specific prompt
    const statePrompt = buildBorrowerStatePrompt(this.fsmState);

    // Build conversation context
    let prompt = "";

    // Recent history (last 6 turns)
    const recentHistory = this.conversationHistory.slice(-6);
    if (recentHistory.length > 0) {
      prompt += "RECENT CONVERSATION:\n";
      for (const turn of recentHistory) {
        const speaker = turn.role === "agent" ? "Agent" : "You";
        prompt += `${speaker}: ${turn.text}\n`;
      }
      prompt += "\n";
    }

    prompt += `AGENT SAYS: "${agentUtterance}"\n\n`;
    prompt += statePrompt;
    prompt += "\nRespond as the borrower:";

    // Get LLM response
    let responseText: string;
    try {
      responseText = await this.llmClient.complete(prompt, this.systemPrompt);
    } catch (error) {
      console.error("LLM error:", error);
      responseText = "I'm sorry, what did you say?";
    }

    responseText = responseText.trim();

    // Update conversation history
    this.conversationHistory.push({ role: "agent", text: agentUtterance });
    this.conversationHistory.push({ role: "borrower", text: responseText });

    // Detect signals and hangup
    const detectedSignal = detectSignals(responseText);
    const shouldHangup = detectHangup(responseText) || isPathComplete(this.fsmState);

    return {
      text: responseText,
      shouldHangup,
      detectedSignal,
      patienceRemaining: 10 - this.fsmState.pathIndex, // Decreases as we progress
    };
  }

  /**
   * Reset simulator for new episode with optional new persona.
   */
  reset(persona?: VoicePersona): void {
    if (persona) {
      this.persona = persona;
      this.systemPrompt = buildBorrowerInstructions(persona);
    }
    this.fsmState = initBorrowerFSM(this.persona);
    this.conversationHistory = [];
    this.currentAgentState = "OPENING";
  }

  /**
   * Get current persona.
   */
  getPersona(): VoicePersona {
    return this.persona;
  }

  /**
   * Check if path is complete.
   */
  isComplete(): boolean {
    return isPathComplete(this.fsmState);
  }

  /**
   * Get current path progress (0-1).
   */
  getProgress(): number {
    return this.fsmState.pathIndex / (this.persona.path.length - 1);
  }
}
