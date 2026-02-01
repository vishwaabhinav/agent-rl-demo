/**
 * LLM-based state classification for voice conversations
 */

import OpenAI from "openai";
import type { FSMState, Message } from "../types";
import type { StateClassificationResult } from "./types";
import { VALID_STATES } from "./fsm-validation";

// Lazy-initialized OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

const STATE_CLASSIFICATION_PROMPT = `You are analyzing a debt collection call to determine the NEXT state (one step at a time).

MAIN FLOW (must progress ONE STEP at a time):
1. OPENING → 2. DISCLOSURE → 3. CONSENT_RECORDING → 4. DEBT_CONTEXT → 5. NEGOTIATION → 6. PAYMENT_SETUP → 7. WRAPUP → 8. END_CALL

OPTIONAL STATE:
- IDENTITY_VERIFICATION: Can be entered if agent needs to verify identity, but is NOT required in the main flow

STATE DEFINITIONS:
- OPENING: Initial greeting. User confirms they are the person ("yes speaking", "this is [name]") → move to DISCLOSURE
- DISCLOSURE: Agent introduces themselves and company. Any user response → move to CONSENT_RECORDING
- IDENTITY_VERIFICATION: (Optional) Agent asks for SSN/DOB. User provides verification info → move to CONSENT_RECORDING
- CONSENT_RECORDING: Agent asks "can I record this call?". User says yes/no → move to DEBT_CONTEXT
- DEBT_CONTEXT: Agent explains the debt. User asks questions or acknowledges → move to NEGOTIATION
- NEGOTIATION: Discussing payment options/amounts. User AGREES to pay → move to PAYMENT_SETUP
- PAYMENT_SETUP: Collecting payment details (card, date). Details confirmed → move to WRAPUP
- WRAPUP: Summarizing agreement. User acknowledges → move to END_CALL
- END_CALL: Goodbyes exchanged

CRITICAL: You can ONLY move to the NEXT state in the sequence.
- If current is DISCLOSURE, next can be CONSENT_RECORDING (or optionally IDENTITY_VERIFICATION)
- If current is IDENTITY_VERIFICATION, next can ONLY be CONSENT_RECORDING
- If current is CONSENT_RECORDING, next can ONLY be DEBT_CONTEXT
- Do NOT skip states!

SPECIAL STATES (can be reached from any state):
- DO_NOT_CALL: User says "stop calling", "don't contact me"
- WRONG_PARTY_FLOW: User says "wrong number", "not me"
- DISPUTE_FLOW: User says "I don't owe this", "not my debt" (NOT "I don't remember")
- ESCALATE_HUMAN: User says "speak to supervisor", "escalate"
- CALLBACK_SCHEDULED: User wants callback without paying now

"I don't remember this charge" = stay in DEBT_CONTEXT (it's a question, not dispute)

Respond with JSON: {"nextState": "STATE_NAME", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

/**
 * Classify the next conversation state using LLM
 */
export async function classifyStateWithLLM(
  currentState: FSMState,
  userText: string,
  recentMessages: Message[]
): Promise<StateClassificationResult> {
  try {
    const openai = getOpenAIClient();

    const conversationContext = recentMessages
      .slice(-6) // Last 6 messages for context
      .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: STATE_CLASSIFICATION_PROMPT,
        },
        {
          role: "user",
          content: `Current state: ${currentState}

Recent conversation:
${conversationContext}

Latest user message: "${userText}"

What state should the conversation be in now?`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    // Validate the state
    if (!VALID_STATES.includes(result.nextState)) {
      console.warn(`[StateClassifier] Invalid state returned: ${result.nextState}, keeping ${currentState}`);
      return { nextState: currentState, confidence: 0, reasoning: "Invalid state returned" };
    }

    return {
      nextState: result.nextState as FSMState,
      confidence: result.confidence || 0.5,
      reasoning: result.reasoning || "",
    };
  } catch (error) {
    console.error("[StateClassifier] Classification error:", error);
    return { nextState: currentState, confidence: 0, reasoning: "Error in classification" };
  }
}

/**
 * Determine if a state transition should be applied based on LLM result and validation
 */
export function shouldApplyTransition(
  currentState: FSMState,
  llmResult: StateClassificationResult,
  isValid: boolean,
  confidenceThreshold: number = 0.5
): { apply: boolean; reason: string } {
  if (llmResult.nextState === currentState) {
    return { apply: false, reason: "LLM: stay in current state" };
  }

  if (isValid && llmResult.confidence >= confidenceThreshold) {
    return {
      apply: true,
      reason: `LLM (${(llmResult.confidence * 100).toFixed(0)}%): ${llmResult.reasoning}`,
    };
  }

  return {
    apply: false,
    reason: `LLM not confident enough (${(llmResult.confidence * 100).toFixed(0)}%) or invalid transition`,
  };
}
