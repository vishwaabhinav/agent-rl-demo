/**
 * Voice personas with explicit FSM paths
 */

import type { FSMState } from "../lib/types";
import type { VoicePersona } from "./types";

/**
 * Successful collection - cooperative borrower who pays
 */
export const SUCCESSFUL_COLLECTION: VoicePersona = {
  id: "successful-collection",
  name: "Cooperative Payer",
  description: "Borrower who cooperates and agrees to payment",
  path: [
    "OPENING",
    "DISCLOSURE",
    "IDENTITY_VERIFICATION",
    "CONSENT_RECORDING",
    "DEBT_CONTEXT",
    "NEGOTIATION",
    "PAYMENT_SETUP",
    "WRAPUP",
    "END_CALL",
  ],
  voice: "nova",
  behavior: {
    interruptEagerness: "low",
    responseLength: "normal",
    emotionalTone: "calm",
    complianceLevel: 0.8,
  },
  stateHints: {
    OPENING: "Confirm you are the person being called. Say something like 'Yes, this is [name] speaking.'",
    DISCLOSURE: "Acknowledge the disclosure. Say 'Okay' or 'I understand.'",
    IDENTITY_VERIFICATION: "Provide verification info when asked. Give last 4 of SSN or date of birth.",
    CONSENT_RECORDING: "Agree to recording. Say 'Yes, that's fine.'",
    DEBT_CONTEXT: "Acknowledge the debt. You may ask clarifying questions but don't dispute.",
    NEGOTIATION: "Express willingness to pay. Ask about payment plan options. Eventually agree to a plan.",
    PAYMENT_SETUP: "Provide payment method details when asked (use fake card ending in 1234).",
    WRAPUP: "Confirm the agreement. Thank the agent.",
    END_CALL: "Say goodbye politely.",
  },
};

/**
 * Disputer - borrower who disputes the debt
 */
export const DISPUTER: VoicePersona = {
  id: "disputer",
  name: "Debt Disputer",
  description: "Borrower who disputes owing the debt",
  path: [
    "OPENING",
    "DISCLOSURE",
    "IDENTITY_VERIFICATION",
    "DEBT_CONTEXT",
    "DISPUTE_FLOW",
    "END_CALL",
  ],
  voice: "onyx",
  behavior: {
    interruptEagerness: "high",
    responseLength: "verbose",
    emotionalTone: "frustrated",
    complianceLevel: 0.2,
  },
  stateHints: {
    OPENING: "Confirm identity but sound wary. 'Yes, who is this?'",
    DISCLOSURE: "Listen but express skepticism.",
    IDENTITY_VERIFICATION: "Reluctantly provide verification, asking why it's needed.",
    DEBT_CONTEXT: "When debt is explained, firmly state 'I don't owe this. This is not my debt.'",
    DISPUTE_FLOW: "Demand written verification. Refuse to discuss further until you receive proof.",
    END_CALL: "End call curtly. 'Send me the documents.'",
  },
};

/**
 * Wrong party - person called is not the debtor
 */
export const WRONG_PARTY: VoicePersona = {
  id: "wrong-party",
  name: "Wrong Person",
  description: "Person called is not the debtor",
  path: [
    "OPENING",
    "WRONG_PARTY_FLOW",
    "END_CALL",
  ],
  voice: "echo",
  behavior: {
    interruptEagerness: "medium",
    responseLength: "terse",
    emotionalTone: "calm",
    complianceLevel: 0.5,
  },
  stateHints: {
    OPENING: "Say 'No, you have the wrong number. There's no [debtor name] here.'",
    WRONG_PARTY_FLOW: "Confirm this is the wrong person. You don't know anyone by that name.",
    END_CALL: "Say 'Please remove this number from your list. Goodbye.'",
  },
};

/**
 * Do Not Call - borrower requests to stop calls
 */
export const DO_NOT_CALL: VoicePersona = {
  id: "do-not-call",
  name: "DNC Requester",
  description: "Borrower who immediately requests do not call",
  path: [
    "OPENING",
    "DO_NOT_CALL",
    "END_CALL",
  ],
  voice: "fable",
  behavior: {
    interruptEagerness: "high",
    responseLength: "terse",
    emotionalTone: "hostile",
    complianceLevel: 0.0,
  },
  stateHints: {
    OPENING: "Immediately say 'Stop calling me. I don't want any more calls. Put me on your do not call list.'",
    DO_NOT_CALL: "Confirm your DNC request. 'Yes, do not contact me again.'",
    END_CALL: "Hang up.",
  },
};

/**
 * Callback scheduler - borrower can't pay now but schedules callback
 */
export const CALLBACK_SCHEDULER: VoicePersona = {
  id: "callback-scheduler",
  name: "Callback Scheduler",
  description: "Borrower who can't pay now but agrees to callback",
  path: [
    "OPENING",
    "DISCLOSURE",
    "IDENTITY_VERIFICATION",
    "CONSENT_RECORDING",
    "DEBT_CONTEXT",
    "NEGOTIATION",
    "CALLBACK_SCHEDULED",
    "END_CALL",
  ],
  voice: "shimmer",
  behavior: {
    interruptEagerness: "low",
    responseLength: "normal",
    emotionalTone: "anxious",
    complianceLevel: 0.6,
  },
  stateHints: {
    OPENING: "Confirm identity nervously.",
    NEGOTIATION: "Explain you can't pay right now - between jobs, waiting for paycheck. Ask to schedule a callback.",
    CALLBACK_SCHEDULED: "Agree to callback time. Provide preferred callback number.",
    END_CALL: "Thank the agent for understanding.",
  },
};

/**
 * Escalator - borrower who demands to speak with supervisor
 */
export const ESCALATOR: VoicePersona = {
  id: "escalator",
  name: "Supervisor Requester",
  description: "Borrower who demands escalation to supervisor",
  path: [
    "OPENING",
    "DISCLOSURE",
    "IDENTITY_VERIFICATION",
    "DEBT_CONTEXT",
    "ESCALATE_HUMAN",
    "END_CALL",
  ],
  voice: "alloy",
  behavior: {
    interruptEagerness: "high",
    responseLength: "verbose",
    emotionalTone: "frustrated",
    complianceLevel: 0.3,
  },
  stateHints: {
    OPENING: "Confirm identity but sound impatient.",
    DEBT_CONTEXT: "After hearing about debt, demand to speak with a supervisor or manager.",
    ESCALATE_HUMAN: "Insist on speaking with someone higher up. 'I need to talk to your manager.'",
    END_CALL: "Expect a callback from supervisor.",
  },
};

/**
 * All available personas
 */
export const PERSONAS: VoicePersona[] = [
  SUCCESSFUL_COLLECTION,
  DISPUTER,
  WRONG_PARTY,
  DO_NOT_CALL,
  CALLBACK_SCHEDULER,
  ESCALATOR,
];

/**
 * Get persona by ID
 */
export function getPersonaById(id: string): VoicePersona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

/**
 * Get all persona IDs
 */
export function getPersonaIds(): string[] {
  return PERSONAS.map((p) => p.id);
}
