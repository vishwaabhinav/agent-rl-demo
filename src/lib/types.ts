// ============ FSM Types ============

export type FSMState =
  | "OPENING"
  | "DISCLOSURE"
  | "IDENTITY_VERIFICATION"
  | "CONSENT_RECORDING"
  | "DEBT_CONTEXT"
  | "NEGOTIATION"
  | "PAYMENT_SETUP"
  | "WRAPUP"
  | "CALLBACK_SCHEDULED"  // Call ending without payment - follow-up needed
  | "DISPUTE_FLOW"
  | "WRONG_PARTY_FLOW"
  | "DO_NOT_CALL"
  | "ESCALATE_HUMAN"
  | "END_CALL";

export type Intent =
  | "PROCEED"
  | "ASK_CLARIFY"
  | "HANDLE_PUSHBACK"
  | "IDENTIFY_SELF"
  | "ASK_VERIFICATION"
  | "CONFIRM_IDENTITY"
  | "EMPATHIZE"
  | "OFFER_PLAN"
  | "COUNTER_OFFER"
  | "REQUEST_CALLBACK"
  | "CONFIRM_PLAN"
  | "SEND_PAYMENT_LINK"
  | "SUMMARIZE"
  | "ACKNOWLEDGE_DISPUTE"
  | "ACKNOWLEDGE_DNC"
  | "APOLOGIZE"
  | "ESCALATE";

export type UserSignal =
  | "STOP_CONTACT"
  | "DISPUTE"
  | "WRONG_PARTY"
  | "ATTORNEY_REPRESENTED"
  | "INCONVENIENT_TIME"
  | "CALLBACK_REQUEST"
  | "AGREEMENT"
  | "REFUSAL"
  | "CONFUSION"
  | "HOSTILITY";

// ============ Policy Types ============

export interface PolicyConfig {
  jurisdiction: string;
  callWindowStart: string;
  callWindowEnd: string;
  maxAttemptsPerDay: number;
  maxAttemptsTotal: number;
  prohibitedPhrases: string[];
  requireRecordingConsent: boolean;
}

export interface PolicyOutput {
  allowed: boolean;
  forcedTransition: FSMState | null;
  requiredTemplates: string[];
  blockedReasons: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

// ============ Case Types ============

export interface CaseData {
  id: string;
  debtorName: string;
  debtorPhone: string;
  creditorName: string;
  amountDue: number;
  daysPastDue: number;
  jurisdiction: string;
  timezone: string;
  language: string;
  dnc: boolean;
  disputed: boolean;
  wrongParty: boolean;
  recordingConsent: boolean | null;
  identityVerified: boolean | null;
  attemptCountToday: number;
  attemptCountTotal: number;
}

// ============ Session Types ============

export interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: Date;
}

export interface TurnTrace {
  turnIndex: number;
  userText: string;
  assistantText: string;
  detectedSignals: UserSignal[];
  fsmStateBefore: FSMState;
  fsmStateAfter: FSMState;
  policyDecision: PolicyOutput;
  llmInput: LLMInput;
  llmOutput: LLMOutput;
  validationResult: ValidationResult;
  latencyMs: number;
  timestamp: Date;
}

// ============ LLM Types ============

export interface LLMInput {
  caseId: string;
  language: string;
  state: FSMState;
  userUtterance: string;
  slots: Record<string, string | number | boolean>;
  allowedIntents: Intent[];
  prohibitedTopics: string[];
  toolPermissions: string[];
  requiredTemplates: string[];
}

export interface LLMOutput {
  chosenIntent: Intent;
  assistantText: string;
  toolCalls: ToolCall[];
  confidence: number;
  tokensUsed: number;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

// ============ Validation Types ============

export interface ValidationResult {
  passed: boolean;
  failures: ValidationFailure[];
  repairsAttempted: number;
  fallbackUsed: boolean;
}

export interface ValidationFailure {
  validator: string;
  detail: string;
}

// ============ Call State ============

export type CallStatus = "idle" | "ringing" | "connecting" | "active" | "ending" | "ended" | "declined";

// Status type unions for cleaner conditional logic
export type ActiveCallStatus = "ringing" | "connecting" | "active";
export type TerminalCallStatus = "ended" | "declined";

const ACTIVE_STATUSES: ActiveCallStatus[] = ["ringing", "connecting", "active"];
const TERMINAL_STATUSES: TerminalCallStatus[] = ["ended", "declined"];

export const isActiveStatus = (s: CallStatus): s is ActiveCallStatus =>
  ACTIVE_STATUSES.includes(s as ActiveCallStatus);

export const isTerminalStatus = (s: CallStatus): s is TerminalCallStatus =>
  TERMINAL_STATUSES.includes(s as TerminalCallStatus);

export interface CallState {
  status: CallStatus;
  sessionId: string | null;
  currentCase: CaseData | null;
  currentState: FSMState;
  stateHistory: FSMState[];
  messages: Message[];
  currentTurnTrace: TurnTrace | null;
  traceHistory: TurnTrace[];
  isUserSpeaking: boolean;
  isAgentSpeaking: boolean;
}
