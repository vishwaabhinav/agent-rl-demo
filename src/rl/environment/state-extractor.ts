/**
 * State Feature Extractor
 *
 * Extracts structured RLState features from FSM context, session, and case data.
 * Provides discretization for tabular methods.
 */

import type { FSMState, UserSignal, CaseData, Message } from "../../lib/types";
import type { FSMContext } from "../../lib/engine/fsm";
import type {
  RLState,
  DebtBucket,
  DaysPastDueBucket,
  Sentiment,
  DiscreteStateKey,
  RLAction,
} from "../types";

/**
 * Extract debt bucket from amount.
 */
export function getDebtBucket(amount: number): DebtBucket {
  if (amount < 1000) return "LOW";
  if (amount < 5000) return "MEDIUM";
  return "HIGH";
}

/**
 * Extract days past due bucket.
 */
export function getDaysPastDueBucket(days: number): DaysPastDueBucket {
  if (days < 60) return "30";
  if (days < 90) return "60";
  if (days < 120) return "90";
  return "120+";
}

/**
 * Simple keyword-based sentiment classifier.
 * In production, could use LLM or more sophisticated NLP.
 */
export function classifySentiment(text: string): Sentiment {
  const lowerText = text.toLowerCase();

  const positiveKeywords = [
    "yes",
    "okay",
    "sure",
    "i can",
    "i will",
    "agree",
    "understand",
    "thank",
    "appreciate",
    "pay",
    "help",
  ];

  const negativeKeywords = [
    "no",
    "can't",
    "cannot",
    "won't",
    "refuse",
    "never",
    "stop",
    "harass",
    "scam",
    "fraud",
    "lawyer",
    "sue",
    "angry",
    "upset",
    "ridiculous",
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const keyword of positiveKeywords) {
    if (lowerText.includes(keyword)) positiveCount++;
  }

  for (const keyword of negativeKeywords) {
    if (lowerText.includes(keyword)) negativeCount++;
  }

  if (positiveCount > negativeCount + 1) return "POSITIVE";
  if (negativeCount > positiveCount + 1) return "NEGATIVE";
  return "NEUTRAL";
}

/**
 * Count objections (REFUSAL, DISPUTE signals) in signal history.
 */
export function countObjections(signalHistory: UserSignal[]): number {
  const objectionSignals: UserSignal[] = ["REFUSAL", "DISPUTE", "HOSTILITY"];
  return signalHistory.filter((s) => objectionSignals.includes(s)).length;
}

/**
 * Count offers made (OFFER_PLAN, COUNTER_OFFER intents) in action history.
 */
export function countOffersMade(actionHistory: RLAction[]): number {
  const offerActions: RLAction[] = ["OFFER_PLAN", "COUNTER_OFFER"];
  return actionHistory.filter((a) => offerActions.includes(a)).length;
}

/**
 * Calculate time spent in current state.
 */
export function calculateTimeInState(stateHistory: FSMState[]): number {
  if (stateHistory.length === 0) return 0;

  const currentState = stateHistory[stateHistory.length - 1];
  let count = 0;

  // Count backwards from end until we hit a different state
  for (let i = stateHistory.length - 1; i >= 0; i--) {
    if (stateHistory[i] === currentState) {
      count++;
    } else {
      break;
    }
  }

  return count;
}

/**
 * Session context needed for state extraction.
 */
export interface SessionContext {
  fsmContext: FSMContext;
  caseData: CaseData;
  messages: Message[];
  signalHistory: UserSignal[];
  actionHistory: RLAction[];
  turnCount: number;
}

/**
 * Extract RLState from session context.
 */
export function extractState(context: SessionContext): RLState {
  const { fsmContext, caseData, messages, signalHistory, actionHistory, turnCount } = context;

  // Get last borrower message for sentiment analysis
  const lastBorrowerMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  const sentiment = lastBorrowerMessage
    ? classifySentiment(lastBorrowerMessage.text)
    : "NEUTRAL";

  // Get last detected signal
  const lastSignal = signalHistory.length > 0
    ? signalHistory[signalHistory.length - 1]
    : null;

  // Check progress flags from slots
  const identityVerified = fsmContext.slots["identity_verified"] === true;
  const disclosureComplete = fsmContext.slots["disclosure_complete"] === true ||
    fsmContext.stateHistory.includes("DEBT_CONTEXT") ||
    fsmContext.stateHistory.includes("NEGOTIATION");

  return {
    fsmState: fsmContext.currentState,
    turnCount,
    timeInState: calculateTimeInState(fsmContext.stateHistory),
    debtBucket: getDebtBucket(caseData.amountDue),
    daysPastDueBucket: getDaysPastDueBucket(caseData.daysPastDue),
    priorAttempts: caseData.attemptCountTotal,
    identityVerified,
    disclosureComplete,
    lastSignal,
    sentiment,
    objectionsRaised: countObjections(signalHistory),
    offersMade: countOffersMade(actionHistory),
  };
}

/**
 * Discretize RLState to a string key for tabular methods.
 * Includes all features that affect Q-values.
 */
export function discretizeState(state: RLState): DiscreteStateKey {
  const parts = [
    `fsm:${state.fsmState}`,
    `turn:${Math.min(state.turnCount, 20)}`, // Cap at 20 to limit state space
    `tis:${Math.min(state.timeInState, 5)}`, // Cap time in state
    `debt:${state.debtBucket}`,
    `dpd:${state.daysPastDueBucket}`,
    `prior:${Math.min(state.priorAttempts, 5)}`, // Cap prior attempts
    `id:${state.identityVerified ? 1 : 0}`,
    `disc:${state.disclosureComplete ? 1 : 0}`,
    `sig:${state.lastSignal || "none"}`,
    `sent:${state.sentiment}`,
    `obj:${Math.min(state.objectionsRaised, 3)}`, // Cap objections
    `off:${Math.min(state.offersMade, 3)}`, // Cap offers
  ];

  return parts.join("|");
}

/**
 * Create initial state for a new episode.
 */
export function createInitialState(caseData: CaseData): RLState {
  return {
    fsmState: "OPENING",
    turnCount: 0,
    timeInState: 1,
    debtBucket: getDebtBucket(caseData.amountDue),
    daysPastDueBucket: getDaysPastDueBucket(caseData.daysPastDue),
    priorAttempts: caseData.attemptCountTotal,
    identityVerified: false,
    disclosureComplete: false,
    lastSignal: null,
    sentiment: "NEUTRAL",
    objectionsRaised: 0,
    offersMade: 0,
  };
}
