/**
 * Borrower Simulator
 *
 * LLM-based debtor that responds to agent utterances based on persona configuration.
 * Tracks patience and can trigger hangup.
 */

import type { UserSignal } from "../../lib/types";
import type { PersonaConfig, BorrowerResponse } from "../types";
import { describePersona } from "./personas";

/**
 * Interface for LLM client (to be injected).
 */
export interface LLMClient {
  complete(prompt: string, systemPrompt: string): Promise<string>;
}

/**
 * Build system prompt for borrower persona.
 */
function buildSystemPrompt(persona: PersonaConfig): string {
  return `You are role-playing as a person receiving a debt collection call. Stay in character throughout.

PERSONA:
${describePersona(persona)}

BEHAVIOR RULES:
1. Respond naturally as this persona would - use casual language, interruptions, hesitations.
2. Keep responses brief (1-3 sentences typically, occasionally longer if emotional).
3. If you are hostile, you may use dismissive language but avoid profanity.
4. If asked the same question multiple times, express frustration.
5. If an offer matches your financial situation and willingness, consider accepting.
6. If your patience runs out, indicate you want to end the call.
7. Never break character or acknowledge you are an AI.

RESPONSE FORMAT:
Respond ONLY with what the borrower would say. No narration, no actions in asterisks, just dialogue.`;
}

/**
 * Build user prompt for a turn.
 */
function buildUserPrompt(
  agentUtterance: string,
  conversationHistory: Array<{ role: "agent" | "borrower"; text: string }>,
  patienceRemaining: number,
  frustrationEvents: number
): string {
  let prompt = "";

  // Include recent conversation history (last 6 turns)
  const recentHistory = conversationHistory.slice(-6);
  if (recentHistory.length > 0) {
    prompt += "RECENT CONVERSATION:\n";
    for (const turn of recentHistory) {
      const speaker = turn.role === "agent" ? "Agent" : "You";
      prompt += `${speaker}: ${turn.text}\n`;
    }
    prompt += "\n";
  }

  // Current agent utterance
  prompt += `AGENT SAYS: "${agentUtterance}"\n\n`;

  // State reminders
  prompt += `YOUR STATE:\n`;
  prompt += `- Patience remaining: ${patienceRemaining}/10\n`;
  prompt += `- Frustration events so far: ${frustrationEvents}\n`;

  if (patienceRemaining <= 2) {
    prompt += `- You are very frustrated and considering hanging up.\n`;
  } else if (patienceRemaining <= 4) {
    prompt += `- You are getting impatient.\n`;
  }

  prompt += `\nRespond as the borrower would:`;

  return prompt;
}

/**
 * Detect signals from borrower response.
 */
function detectSignals(text: string): UserSignal | undefined {
  const lowerText = text.toLowerCase();

  // Stop contact signals
  if (
    lowerText.includes("stop calling") ||
    lowerText.includes("don't call") ||
    lowerText.includes("do not call") ||
    lowerText.includes("leave me alone") ||
    lowerText.includes("harassment")
  ) {
    return "STOP_CONTACT";
  }

  // Dispute signals
  if (
    lowerText.includes("don't owe") ||
    lowerText.includes("not my debt") ||
    lowerText.includes("dispute") ||
    lowerText.includes("prove it") ||
    lowerText.includes("never heard of")
  ) {
    return "DISPUTE";
  }

  // Wrong party signals
  if (
    lowerText.includes("wrong number") ||
    lowerText.includes("wrong person") ||
    lowerText.includes("not me") ||
    lowerText.includes("don't know who")
  ) {
    return "WRONG_PARTY";
  }

  // Attorney signals
  if (
    lowerText.includes("my lawyer") ||
    lowerText.includes("my attorney") ||
    lowerText.includes("contact my attorney")
  ) {
    return "ATTORNEY_REPRESENTED";
  }

  // Callback request
  if (
    lowerText.includes("call back") ||
    lowerText.includes("call me later") ||
    lowerText.includes("bad time") ||
    lowerText.includes("busy right now")
  ) {
    return "CALLBACK_REQUEST";
  }

  // Agreement signals
  if (
    lowerText.includes("i can pay") ||
    lowerText.includes("i'll pay") ||
    lowerText.includes("i will pay") ||
    lowerText.includes("sounds good") ||
    lowerText.includes("that works") ||
    lowerText.includes("okay, i agree") ||
    lowerText.includes("yes, i agree") ||
    lowerText.includes("let's do it") ||
    lowerText.includes("sign me up")
  ) {
    return "AGREEMENT";
  }

  // Refusal signals
  if (
    lowerText.includes("i can't pay") ||
    lowerText.includes("i won't pay") ||
    lowerText.includes("no way") ||
    lowerText.includes("not paying") ||
    lowerText.includes("forget it") ||
    lowerText.includes("absolutely not")
  ) {
    return "REFUSAL";
  }

  // Confusion signals
  if (
    lowerText.includes("what do you mean") ||
    lowerText.includes("i don't understand") ||
    lowerText.includes("confused") ||
    lowerText.includes("what is this about") ||
    lowerText.includes("huh?")
  ) {
    return "CONFUSION";
  }

  // Hostility signals
  if (
    lowerText.includes("scam") ||
    lowerText.includes("fraud") ||
    lowerText.includes("go to hell") ||
    lowerText.includes("sue you") ||
    lowerText.includes("threatening me")
  ) {
    return "HOSTILITY";
  }

  return undefined;
}

/**
 * Check if response indicates hangup.
 */
function detectHangup(text: string, patienceRemaining: number): boolean {
  const lowerText = text.toLowerCase();

  // Explicit hangup phrases
  if (
    lowerText.includes("hanging up") ||
    lowerText.includes("i'm done") ||
    lowerText.includes("goodbye") ||
    lowerText.includes("*click*") ||
    lowerText.includes("end this call")
  ) {
    return true;
  }

  // Patience exhausted
  if (patienceRemaining <= 0) {
    return true;
  }

  return false;
}

/**
 * Borrower simulator class.
 */
export class BorrowerSimulator {
  private llmClient: LLMClient;
  private persona: PersonaConfig;
  private patienceRemaining: number;
  private conversationHistory: Array<{ role: "agent" | "borrower"; text: string }>;
  private frustrationEvents: number;
  private lastAgentAction: string | null;
  private systemPrompt: string;

  constructor(llmClient: LLMClient, persona: PersonaConfig) {
    this.llmClient = llmClient;
    this.persona = persona;
    this.patienceRemaining = persona.patience;
    this.conversationHistory = [];
    this.frustrationEvents = 0;
    this.lastAgentAction = null;
    this.systemPrompt = buildSystemPrompt(persona);
  }

  /**
   * Get borrower response to agent utterance.
   */
  async respond(agentUtterance: string): Promise<BorrowerResponse> {
    // Check for repeated question (decreases patience)
    if (this.lastAgentAction && this.isSimilar(agentUtterance, this.lastAgentAction)) {
      this.frustrationEvents++;
      this.patienceRemaining = Math.max(0, this.patienceRemaining - 1);
    }

    // Build prompt
    const userPrompt = buildUserPrompt(
      agentUtterance,
      this.conversationHistory,
      this.patienceRemaining,
      this.frustrationEvents
    );

    // Get LLM response
    let responseText: string;
    try {
      responseText = await this.llmClient.complete(userPrompt, this.systemPrompt);
    } catch (error) {
      // Fallback response on error
      responseText = "I'm sorry, what did you say?";
    }

    // Clean up response
    responseText = responseText.trim();

    // Update conversation history
    this.conversationHistory.push({ role: "agent", text: agentUtterance });
    this.conversationHistory.push({ role: "borrower", text: responseText });
    this.lastAgentAction = agentUtterance;

    // Detect signals and hangup
    const detectedSignal = detectSignals(responseText);
    const shouldHangup = detectHangup(responseText, this.patienceRemaining);

    // Decrease patience on negative interactions
    if (
      detectedSignal === "HOSTILITY" ||
      detectedSignal === "REFUSAL" ||
      detectedSignal === "STOP_CONTACT"
    ) {
      this.patienceRemaining = Math.max(0, this.patienceRemaining - 1);
    }

    // Small random patience decrease
    if (Math.random() < 0.1) {
      this.patienceRemaining = Math.max(0, this.patienceRemaining - 0.5);
    }

    return {
      text: responseText,
      shouldHangup,
      detectedSignal,
      patienceRemaining: this.patienceRemaining,
    };
  }

  /**
   * Check if two utterances are similar (repeated question detection).
   */
  private isSimilar(a: string, b: string): boolean {
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

    const aNorm = normalize(a);
    const bNorm = normalize(b);

    // Simple similarity: significant word overlap
    const aWords = aNorm.split(/\s+/);
    const bWords = new Set(bNorm.split(/\s+/));

    const intersection = aWords.filter((w) => bWords.has(w));
    const unionSize = new Set(aWords.concat(Array.from(bWords))).size;

    const jaccard = intersection.length / unionSize;
    return jaccard > 0.5;
  }

  /**
   * Reset simulator for new episode.
   */
  reset(persona?: PersonaConfig): void {
    if (persona) {
      this.persona = persona;
      this.systemPrompt = buildSystemPrompt(persona);
    }
    this.patienceRemaining = this.persona.patience;
    this.conversationHistory = [];
    this.frustrationEvents = 0;
    this.lastAgentAction = null;
  }

  /**
   * Get current persona.
   */
  getPersona(): PersonaConfig {
    return this.persona;
  }

  /**
   * Get conversation history.
   */
  getHistory(): Array<{ role: "agent" | "borrower"; text: string }> {
    return [...this.conversationHistory];
  }

  /**
   * Get remaining patience.
   */
  getPatienceRemaining(): number {
    return this.patienceRemaining;
  }
}

/**
 * Simple mock LLM client for testing.
 * Returns canned responses based on persona.
 */
export class MockLLMClient implements LLMClient {
  async complete(prompt: string, _systemPrompt: string): Promise<string> {
    // Extract patience from prompt
    const patienceMatch = prompt.match(/Patience remaining: (\d+)/);
    const patience = patienceMatch ? parseInt(patienceMatch[1]) : 5;

    // Very low patience -> hang up
    if (patience <= 1) {
      return "I'm done with this call. Goodbye.";
    }

    // Check for keywords in agent utterance
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes("verify") || lowerPrompt.includes("confirm your identity")) {
      return "Yes, this is me. What do you want?";
    }

    if (lowerPrompt.includes("payment plan") || lowerPrompt.includes("offer")) {
      if (patience > 5) {
        return "Okay, that might work. Tell me more about the payment plan.";
      } else {
        return "I don't know if I can afford that.";
      }
    }

    if (lowerPrompt.includes("amount") || lowerPrompt.includes("owe")) {
      return "I'm aware of the debt, but money is tight right now.";
    }

    // Default responses
    const responses = [
      "Okay, I'm listening.",
      "Go on.",
      "What else?",
      "I understand.",
      "Hmm, let me think about that.",
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }
}
