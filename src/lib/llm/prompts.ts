import type { FSMState, Intent, CaseData, LLMInput } from "../types";

// State-specific guidance for the agent
const STATE_GUIDANCE: Record<FSMState, string> = {
  OPENING: `You are initiating contact. Your goals:
- Confirm you are speaking with the correct person
- Be professional and non-threatening
- Do not reveal the nature of the call until identity is confirmed`,

  DISCLOSURE: `You must provide the required Mini-Miranda disclosure:
- State your name and company
- State this is an attempt to collect a debt
- State any information obtained will be used for that purpose
- If required, mention the call may be recorded`,

  IDENTITY_VERIFICATION: `Verify the debtor's identity:
- Ask for verification information (last 4 of SSN, DOB, or address)
- If they cannot verify, you cannot proceed with debt discussion
- Be patient if they need time to retrieve information`,

  CONSENT_RECORDING: `Obtain consent for call recording if required:
- Clearly ask if they consent to the call being recorded
- If they decline, note this and continue (unless jurisdiction requires consent)
- Do not pressure them to consent`,

  DEBT_CONTEXT: `Explain the debt situation:
- State the creditor name
- State the current balance
- Explain how long the account has been past due
- Be factual and non-judgmental`,

  NEGOTIATION: `Work toward a resolution:
- Listen to the debtor's situation empathetically
- Offer payment options (full payment, payment plan, settlement if authorized)
- Be flexible and understanding
- Do not make promises you cannot keep
- Do not use pressure tactics`,

  PAYMENT_SETUP: `Finalize payment arrangements:
- Confirm the agreed payment terms
- Explain how payment can be made
- Offer to send payment link/instructions
- Confirm contact information for confirmation`,

  CALLBACK_SCHEDULED: `A callback has been scheduled:
- Confirm the callback date and time
- Verify the phone number to call back
- Summarize what will be discussed on the callback
- Thank them and end the call professionally`,

  WRAPUP: `Conclude the call professionally:
- Summarize any agreements made
- Confirm next steps if applicable
- Thank them for their time
- Provide contact information for questions`,

  DISPUTE_FLOW: `Handle the dispute appropriately:
- Acknowledge their right to dispute
- Explain you will cease collection until dispute is resolved
- Inform them written verification will be sent
- Do not argue or pressure them`,

  WRONG_PARTY_FLOW: `Handle the wrong party situation:
- Apologize for the error
- Do not reveal any debt details
- Ask if they know how to reach the correct person (optional)
- Thank them and end the call`,

  DO_NOT_CALL: `Respect the DNC request:
- Acknowledge their request immediately
- Confirm you are adding them to the do-not-call list
- Provide a confirmation number if available
- End the call professionally`,

  ESCALATE_HUMAN: `Prepare for escalation:
- Acknowledge their request to speak with someone else
- Assure them you will transfer/have someone call back
- Get their preferred callback number and time if needed
- Thank them for their patience`,

  END_CALL: `End the call:
- Provide a brief summary if appropriate
- Thank them for their time
- Say goodbye professionally`,
};

// Signal detection patterns
export const SIGNAL_PATTERNS: Record<string, RegExp[]> = {
  STOP_CONTACT: [
    /stop calling/i,
    /don'?t (call|contact) me/i,
    /do not call/i,
    /remove (me|my number)/i,
    /take me off/i,
    /leave me alone/i,
    /stop harassing/i,
  ],
  DISPUTE: [
    /i dispute/i,
    /not my debt/i,
    /i don'?t owe/i,
    /this is wrong/i,
    /never had (an |this )?account/i,
    /send (me )?(proof|validation|verification)/i,
    /prove it/i,
  ],
  WRONG_PARTY: [
    /wrong (number|person)/i,
    /i'?m not/i,
    /that'?s not me/i,
    /never heard of/i,
    /you have the wrong/i,
    /no one (here )?by that name/i,
  ],
  ATTORNEY_REPRESENTED: [
    /my (attorney|lawyer)/i,
    /talk to my lawyer/i,
    /i have (an |legal )?representation/i,
    /contact my attorney/i,
  ],
  INCONVENIENT_TIME: [
    /not a good time/i,
    /i'?m (busy|at work|driving)/i,
    /call (me )?back/i,
    /can you call later/i,
    /bad time/i,
  ],
  CALLBACK_REQUEST: [
    /call me (back|later|tomorrow)/i,
    /can i call you/i,
    /i'?ll call you/i,
    /give me (a |the )?number/i,
  ],
  AGREEMENT: [
    /ok(ay)?/i,
    /yes/i,
    /i (can|will) (do|pay|agree)/i,
    /that works/i,
    /sounds good/i,
    /let'?s do (it|that)/i,
  ],
  REFUSAL: [
    /no/i,
    /i (can'?t|won'?t|refuse)/i,
    /not going to/i,
    /forget it/i,
    /i'?m not paying/i,
  ],
  CONFUSION: [
    /what\?/i,
    /i don'?t understand/i,
    /can you (explain|repeat)/i,
    /what (do you mean|are you talking about)/i,
    /huh\?/i,
  ],
  HOSTILITY: [
    /f[*u]ck/i,
    /go to hell/i,
    /scam/i,
    /fraud/i,
    /threatening/i,
    /i'?ll (sue|report) you/i,
    /harassment/i,
  ],
};

// Build the system prompt for the agent
export function buildSystemPrompt(input: LLMInput, caseData: CaseData): string {
  const stateGuidance = STATE_GUIDANCE[input.state] || "";
  const intentList = input.allowedIntents.join(", ");
  const prohibitedList = input.prohibitedTopics.join(", ") || "None specified";

  return `You are a professional debt collection agent. Your role is to collect debts while strictly following all regulations and treating debtors with respect and empathy.

## Current State: ${input.state}
${stateGuidance}

## Case Information
- Debtor Name: ${caseData.debtorName}
- Creditor: ${caseData.creditorName}
- Amount Due: $${caseData.amountDue.toLocaleString()}
- Days Past Due: ${caseData.daysPastDue}
- Jurisdiction: ${caseData.jurisdiction}

## Conversation Context
${Object.entries(input.slots).length > 0 ? `Gathered Information: ${JSON.stringify(input.slots)}` : "No additional context yet."}

## Response Requirements
1. Choose one of these intents for your response: ${intentList}
2. Keep your response conversational and natural
3. Be professional, empathetic, and compliant
4. Never use these prohibited phrases: ${prohibitedList}
5. Do not threaten, harass, or use aggressive language
6. If the debtor expresses distress, acknowledge it with empathy

${input.requiredTemplates.length > 0 ? `## Required Templates to Include\n${input.requiredTemplates.join("\n")}` : ""}

You must respond with valid JSON in this exact format:
{
  "intent": "CHOSEN_INTENT",
  "response": "Your natural language response to the debtor",
  "confidence": 0.85
}`;
}

// Build the user prompt with the debtor's message
export function buildUserPrompt(userUtterance: string): string {
  if (!userUtterance || userUtterance.trim() === "") {
    return "The debtor has answered the call but hasn't said anything yet. Provide your opening.";
  }

  return `Debtor says: "${userUtterance}"

Respond appropriately based on the current state and conversation context. Remember to output valid JSON.`;
}

// Detect signals from user text
export function detectSignals(text: string): string[] {
  const signals: string[] = [];

  for (const [signal, patterns] of Object.entries(SIGNAL_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        signals.push(signal);
        break; // Only add each signal once
      }
    }
  }

  return signals;
}

// Get intent description for display
export function getIntentDescription(intent: Intent): string {
  const descriptions: Record<Intent, string> = {
    PROCEED: "Continue with the conversation flow",
    ASK_CLARIFY: "Ask for clarification or more information",
    HANDLE_PUSHBACK: "Address objections or resistance",
    IDENTIFY_SELF: "Introduce yourself and your company",
    ASK_VERIFICATION: "Request identity verification",
    CONFIRM_IDENTITY: "Confirm the debtor's identity",
    EMPATHIZE: "Show understanding and empathy",
    OFFER_PLAN: "Propose a payment arrangement",
    COUNTER_OFFER: "Respond to debtor's counter-proposal",
    REQUEST_CALLBACK: "Schedule a callback",
    CONFIRM_PLAN: "Finalize and confirm payment arrangement",
    SEND_PAYMENT_LINK: "Provide payment link or instructions",
    SUMMARIZE: "Recap the conversation or agreements",
    ACKNOWLEDGE_DISPUTE: "Acknowledge a debt dispute",
    ACKNOWLEDGE_DNC: "Acknowledge do-not-call request",
    APOLOGIZE: "Apologize for an error or inconvenience",
    ESCALATE: "Transfer to supervisor or schedule callback",
  };

  return descriptions[intent] || intent;
}
