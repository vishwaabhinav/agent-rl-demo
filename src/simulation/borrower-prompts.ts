/**
 * Prompt builders for borrower Realtime session
 */

import type { FSMState } from "../lib/types";
import type { VoicePersona, BorrowerFSMState } from "./types";

/**
 * Build system instructions for borrower persona
 */
export function buildBorrowerInstructions(persona: VoicePersona): string {
  const toneDescriptions = {
    calm: "calm and measured",
    frustrated: "frustrated and impatient",
    anxious: "nervous and uncertain",
    hostile: "hostile and confrontational",
  };

  const lengthDescriptions = {
    terse: "Keep responses very short - just a few words when possible.",
    normal: "Respond naturally with moderate length responses.",
    verbose: "Tend to elaborate and explain yourself at length.",
  };

  const interruptDescriptions = {
    low: "Let the agent finish speaking before you respond.",
    medium: "Sometimes interject if you have something important to say.",
    high: "Feel free to interrupt the agent when you disagree or want to make a point.",
  };

  return `You are role-playing as a debtor receiving a debt collection call. You are NOT the agent - you are the person being called.

## Your Character
- Name: You are the person the agent is calling about a debt
- Tone: ${toneDescriptions[persona.behavior.emotionalTone]}
- ${lengthDescriptions[persona.behavior.responseLength]}
- ${interruptDescriptions[persona.behavior.interruptEagerness]}
- Compliance: ${persona.behavior.complianceLevel < 0.3 ? "You are resistant and uncooperative" : persona.behavior.complianceLevel < 0.6 ? "You are somewhat cooperative but hesitant" : "You are generally cooperative"}

## Scenario
${persona.description}

## Important Rules
1. You are the BORROWER, not the agent. Respond as the person receiving the call.
2. Stay in character throughout the conversation.
3. Follow the guidance provided for each state of the conversation.
4. React naturally to what the agent says.
5. Do not break character or acknowledge you are an AI.

## Voice Style
- Use natural speech patterns with filler words occasionally
- React emotionally appropriate to your character
- Sound like a real person on the phone`;
}

/**
 * Build state-specific injection prompt for borrower
 */
export function buildBorrowerStatePrompt(fsm: BorrowerFSMState): string {
  const hint = fsm.persona.stateHints[fsm.currentState];
  const nextState = fsm.expectedNextState;

  let prompt = `[BORROWER GUIDANCE]\n`;
  prompt += `Current conversation state: ${fsm.currentState}\n`;

  if (hint) {
    prompt += `Your goal: ${hint}\n`;
  }

  if (nextState) {
    prompt += `You should guide the conversation toward: ${nextState}\n`;
  }

  // Add state-specific transition triggers
  const transitionHints = getTransitionHint(fsm.currentState, nextState);
  if (transitionHints) {
    prompt += `To trigger transition: ${transitionHints}\n`;
  }

  return prompt;
}

/**
 * Get hint for how to trigger a state transition
 */
function getTransitionHint(current: FSMState, next: FSMState | null): string | null {
  if (!next) return null;

  const hints: Record<string, Record<string, string>> = {
    OPENING: {
      DISCLOSURE: "Confirm your identity so the agent proceeds with disclosure",
      WRONG_PARTY_FLOW: "Say this is the wrong number or you're not that person",
      DO_NOT_CALL: "Immediately request to stop receiving calls",
    },
    DISCLOSURE: {
      IDENTITY_VERIFICATION: "Acknowledge the disclosure so agent proceeds to verify identity",
    },
    IDENTITY_VERIFICATION: {
      CONSENT_RECORDING: "Provide verification information (last 4 SSN or DOB)",
      DEBT_CONTEXT: "Provide verification information",
    },
    CONSENT_RECORDING: {
      DEBT_CONTEXT: "Respond to the recording consent question (yes or no)",
    },
    DEBT_CONTEXT: {
      NEGOTIATION: "Acknowledge the debt and show willingness to discuss payment",
      DISPUTE_FLOW: "Firmly state 'I don't owe this' or 'This is not my debt'",
      ESCALATE_HUMAN: "Demand to speak with a supervisor or manager",
    },
    NEGOTIATION: {
      PAYMENT_SETUP: "Agree to a payment plan or amount",
      CALLBACK_SCHEDULED: "Say you can't pay now but want to schedule a callback",
      ESCALATE_HUMAN: "Demand to speak with a supervisor",
    },
    PAYMENT_SETUP: {
      WRAPUP: "Provide payment details and confirm the arrangement",
    },
    WRAPUP: {
      END_CALL: "Confirm the agreement and prepare to end the call",
    },
    CALLBACK_SCHEDULED: {
      END_CALL: "Confirm the callback time and say goodbye",
    },
    DISPUTE_FLOW: {
      END_CALL: "Demand written verification and end the discussion",
    },
    WRONG_PARTY_FLOW: {
      END_CALL: "Confirm wrong number and ask to be removed from list",
    },
    DO_NOT_CALL: {
      END_CALL: "Confirm DNC request and end call",
    },
    ESCALATE_HUMAN: {
      END_CALL: "Expect callback from supervisor and end call",
    },
  };

  return hints[current]?.[next] || null;
}

/**
 * Build correction prompt if borrower is drifting off path
 */
export function buildCorrectionPrompt(fsm: BorrowerFSMState, attemptNumber: number): string {
  const hint = fsm.persona.stateHints[fsm.currentState];
  const nextState = fsm.expectedNextState;

  let prompt = `[IMPORTANT CORRECTION - Attempt ${attemptNumber}]\n`;
  prompt += `You need to guide the conversation to ${nextState}.\n`;

  if (hint) {
    prompt += `Remember: ${hint}\n`;
  }

  prompt += `Please make your next response clearly move toward this goal.`;

  return prompt;
}
