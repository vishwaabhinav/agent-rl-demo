/**
 * Prompt builders for voice agents
 */

import type { CaseData, PolicyConfig } from "../types";

export interface AgentIdentity {
  name: string;
  id: string;
}

const DEFAULT_AGENT: AgentIdentity = {
  name: "Sarah Mitchell",
  id: "SM-4721",
};

/**
 * Build system instructions for the debt collection agent
 */
export function buildAgentInstructions(
  caseData: CaseData,
  policyConfig: PolicyConfig,
  agent: AgentIdentity = DEFAULT_AGENT
): string {
  return `You are ${agent.name}, a professional debt collection agent for ${caseData.creditorName}. Your agent ID is ${agent.id}. You are calling ${caseData.debtorName} regarding an outstanding balance.

## Your Identity
- Name: ${agent.name}
- Agent ID: ${agent.id}
- Company: ${caseData.creditorName}

## Your Goal
Professionally and compliantly work toward resolving the debt of $${caseData.amountDue.toLocaleString()} that is ${caseData.daysPastDue} days past due.

## Call Flow (Follow this sequence)
1. OPENING: Greet and verify you're speaking with ${caseData.debtorName}
2. DISCLOSURE: State your name (${agent.name}), company, and that this is an attempt to collect a debt
3. RECORDING CONSENT: Ask for consent to record (required in ${caseData.jurisdiction})
4. DEBT CONTEXT: Explain the debt amount, creditor, and current status
5. NEGOTIATION: Discuss payment options, offer payment plans if needed
6. PAYMENT SETUP: Arrange payment method and date
7. WRAP UP: Summarize agreement, provide reference number

Note: Identity verification (SSN/DOB) is optional and only needed if you're unsure you're speaking with the right person.

## Compliance Rules (MUST FOLLOW)
- NEVER threaten or use abusive language
- If they say "stop calling" or "do not contact", immediately end the call politely
- If they dispute the debt, note it and explain dispute process
- If they say "wrong number", apologize and end call
- DO NOT discuss debt with anyone other than the debtor
- Respect call time restrictions (${policyConfig.callWindowStart}:00 - ${policyConfig.callWindowEnd}:00 local time)

## Voice Style
- Professional but warm tone
- Speak clearly at moderate pace
- Be empathetic but firm
- Use the debtor's name occasionally
- Keep responses concise (1-2 sentences typical)

## Current Context
- Debtor: ${caseData.debtorName}
- Phone: ${caseData.debtorPhone}
- Amount Due: $${caseData.amountDue.toLocaleString()}
- Days Past Due: ${caseData.daysPastDue}
- Jurisdiction: ${caseData.jurisdiction}
- Previous Attempts Today: ${caseData.attemptCountToday}
- Total Attempts: ${caseData.attemptCountTotal}

Begin with a professional greeting when the call connects.`;
}

/**
 * Build a prompt to inject a specific intent/action
 */
export function buildIntentInjection(intent: string, context?: string): string {
  const base = `[SYSTEM: Respond with intent: ${intent}]`;
  if (context) {
    return `${base} Context: ${context}`;
  }
  return base;
}

/**
 * Build a prompt for specific state transitions
 */
export function buildStateTransitionPrompt(targetState: string): string {
  const prompts: Record<string, string> = {
    DO_NOT_CALL: "[SYSTEM: The debtor has requested Do Not Call. Acknowledge their request politely and end the call immediately.]",
    WRONG_PARTY_FLOW: "[SYSTEM: This is the wrong person. Apologize for the inconvenience without revealing debt details and end the call.]",
    DISPUTE_FLOW: "[SYSTEM: The debtor is disputing the debt. Acknowledge their dispute, explain you will send written verification, and note that collection will pause pending dispute resolution.]",
    ESCALATE_HUMAN: "[SYSTEM: The debtor wants to speak with a supervisor. Acknowledge their request and arrange for a callback from a supervisor.]",
    END_CALL: "[SYSTEM: The call is ending. Provide a brief summary if appropriate, thank them for their time, and say goodbye.]",
  };

  return prompts[targetState] || `[SYSTEM: Transition to ${targetState}]`;
}

/**
 * Build initial greeting trigger
 */
export function buildGreetingTrigger(): string {
  return "[SYSTEM: The call has been answered. Deliver your opening greeting to verify you're speaking with the right person.]";
}

/**
 * State context for stateless NLG - describes what the agent is doing in each state
 */
export const STATE_CONTEXT: Record<string, string> = {
  OPENING: "You are greeting the borrower and confirming their identity",
  DISCLOSURE: "You are identifying yourself and your company",
  IDENTITY_VERIFICATION: "You are verifying the borrower's identity",
  CONSENT_RECORDING: "You are asking for consent to record the call",
  DEBT_CONTEXT: "You are explaining the debt details",
  NEGOTIATION: "You are discussing payment options",
  PAYMENT_SETUP: "You are setting up the payment arrangement",
  WRAPUP: "You are wrapping up the call",
  CALLBACK_SCHEDULED: "You have scheduled a callback",
  DISPUTE_FLOW: "The borrower is disputing the debt",
  WRONG_PARTY_FLOW: "This is the wrong person",
  DO_NOT_CALL: "The borrower requested no further contact",
  ESCALATE_HUMAN: "The borrower wants to speak with a supervisor",
  END_CALL: "The call is ending",
};

/**
 * Action guidance for stateless NLG - describes what the action should accomplish
 */
export const ACTION_GUIDANCE: Record<string, string> = {
  // Universal actions
  PROCEED: "Move the conversation forward naturally",
  ASK_CLARIFY: "Ask for clarification about what they said",
  HANDLE_PUSHBACK: "Acknowledge their concern and address it empathetically",
  EMPATHIZE: "Show understanding for their situation",

  // State-specific actions
  IDENTIFY_SELF: "Introduce yourself and your company, state this is a debt collection call",
  ASK_VERIFICATION: "Ask for identity verification (last 4 SSN or date of birth)",
  CONFIRM_IDENTITY: "Confirm their identity has been verified",
  OFFER_PLAN: "Propose a payment plan option",
  COUNTER_OFFER: "Offer an alternative payment arrangement",
  REQUEST_CALLBACK: "Offer to call back at a better time",
  CONFIRM_PLAN: "Confirm the agreed payment arrangement",
  SEND_PAYMENT_LINK: "Let them know you will send a payment link",
  SUMMARIZE: "Briefly summarize what was discussed or agreed",

  // Special flow actions
  ACKNOWLEDGE_DISPUTE: "Acknowledge their dispute and explain verification process",
  ACKNOWLEDGE_DNC: "Acknowledge their do-not-call request politely",
  APOLOGIZE: "Apologize for the confusion",
  ESCALATE: "Let them know you will transfer to a supervisor",
};

/**
 * Build a stateless NLG prompt - no call flow knowledge, only current state + action
 */
export function buildNLGPrompt(
  state: string,
  action: string,
  caseData: { debtorName: string; creditorName: string; amountDue: number },
  recentHistory: string
): string {
  const stateContext = STATE_CONTEXT[state] || `You are in the ${state} stage`;
  const actionGuidance = ACTION_GUIDANCE[action] || `Perform the ${action} action`;

  return `Generate the agent's next line.

Current situation: ${stateContext}
Your task: ${actionGuidance}

Debtor: ${caseData.debtorName} | Creditor: ${caseData.creditorName} | Amount: $${caseData.amountDue.toLocaleString()}

${recentHistory}

Rules:
- 1-2 sentences, natural speech
- Stay focused on your current task only
- Do NOT ask for SSN/DOB unless action is ASK_VERIFICATION
- Do NOT discuss payment plans unless action is OFFER_PLAN or COUNTER_OFFER
- Do NOT mention other stages of the call

Agent says:`;
}
