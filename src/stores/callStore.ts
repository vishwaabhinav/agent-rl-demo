import { create } from "zustand";
import type {
  CallState,
  CallStatus,
  CaseData,
  FSMState,
  Message,
  TurnTrace,
} from "@/lib/types";

// Demo cases for testing
export const DEMO_CASES: CaseData[] = [
  {
    id: "case-001",
    debtorName: "John Smith",
    debtorPhone: "+1-555-0101",
    creditorName: "First National Bank",
    amountDue: 2450.0,
    daysPastDue: 45,
    jurisdiction: "US-CA",
    timezone: "America/Los_Angeles",
    language: "en",
    dnc: false,
    disputed: false,
    wrongParty: false,
    recordingConsent: null,
    identityVerified: null,
    attemptCountToday: 0,
    attemptCountTotal: 2,
  },
  {
    id: "case-002",
    debtorName: "Sarah Johnson",
    debtorPhone: "+1-555-0102",
    creditorName: "City Credit Union",
    amountDue: 890.5,
    daysPastDue: 30,
    jurisdiction: "US-NY",
    timezone: "America/New_York",
    language: "en",
    dnc: false,
    disputed: false,
    wrongParty: false,
    recordingConsent: null,
    identityVerified: null,
    attemptCountToday: 1,
    attemptCountTotal: 5,
  },
  {
    id: "case-003",
    debtorName: "Ahmed Al-Hassan",
    debtorPhone: "+971-50-555-0103",
    creditorName: "Emirates Finance",
    amountDue: 15000.0,
    daysPastDue: 60,
    jurisdiction: "UAE",
    timezone: "Asia/Dubai",
    language: "en",
    dnc: false,
    disputed: false,
    wrongParty: false,
    recordingConsent: null,
    identityVerified: null,
    attemptCountToday: 0,
    attemptCountTotal: 3,
  },
  {
    id: "case-004",
    debtorName: "Maria Garcia",
    debtorPhone: "+1-555-0104",
    creditorName: "Texas Auto Finance",
    amountDue: 4200.0,
    daysPastDue: 90,
    jurisdiction: "US-TX",
    timezone: "America/Chicago",
    language: "en",
    dnc: false,
    disputed: true,
    wrongParty: false,
    recordingConsent: null,
    identityVerified: null,
    attemptCountToday: 0,
    attemptCountTotal: 8,
  },
];

interface CallStore extends CallState {
  // Actions
  selectCase: (caseData: CaseData) => void;
  setStatus: (status: CallStatus) => void;
  setSessionId: (sessionId: string | null) => void;
  addMessage: (message: Message | Omit<Message, "id" | "timestamp">) => void;
  setCurrentState: (state: FSMState) => void;
  setTurnTrace: (trace: TurnTrace) => void;
  setUserSpeaking: (speaking: boolean) => void;
  setAgentSpeaking: (speaking: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
  setTranscript: (text: string, isFinal: boolean) => void;
  clearTranscript: () => void;
  setBlockedReason: (reason: string | null, riskLevel?: string) => void;
  reset: () => void;
}

// Extended call state to include processing indicator and transcription
interface ExtendedCallState extends CallState {
  isProcessing: boolean;
  currentTranscript: string;
  isTranscriptFinal: boolean;
  blockedReason: string | null;
  blockedRiskLevel: string | null;
}

const initialState: ExtendedCallState = {
  status: "idle",
  sessionId: null,
  currentCase: null,
  currentState: "OPENING",
  stateHistory: [],
  messages: [],
  currentTurnTrace: null,
  traceHistory: [],
  isUserSpeaking: false,
  isAgentSpeaking: false,
  isProcessing: false,
  currentTranscript: "",
  isTranscriptFinal: false,
  blockedReason: null,
  blockedRiskLevel: null,
};

export const useCallStore = create<CallStore & ExtendedCallState>((set) => ({
  ...initialState,

  selectCase: (caseData) => {
    set({
      currentCase: caseData,
      currentState: "OPENING",
      stateHistory: [],
      messages: [],
      currentTurnTrace: null,
      traceHistory: [],
    });
  },

  setStatus: (status) => set({ status }),

  setSessionId: (sessionId) => set({ sessionId }),

  addMessage: (message) => {
    // If message already has id and timestamp, use as-is
    if ("id" in message && "timestamp" in message) {
      set((state) => ({
        messages: [...state.messages, message as Message],
      }));
    } else {
      const newMessage: Message = {
        ...message,
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: new Date(),
      };
      set((state) => ({
        messages: [...state.messages, newMessage],
      }));
    }
  },

  setCurrentState: (newState) => {
    set((state) => ({
      currentState: newState,
      stateHistory: state.stateHistory[state.stateHistory.length - 1] !== newState
        ? [...state.stateHistory, newState]
        : state.stateHistory,
    }));
  },

  setTurnTrace: (trace) => {
    set((state) => ({
      currentTurnTrace: trace,
      traceHistory: [...state.traceHistory, trace],
    }));
  },

  setUserSpeaking: (speaking) => set({ isUserSpeaking: speaking }),
  setAgentSpeaking: (speaking) => set({ isAgentSpeaking: speaking }),
  setIsProcessing: (processing) => set({ isProcessing: processing }),

  setTranscript: (text, isFinal) =>
    set({ currentTranscript: text, isTranscriptFinal: isFinal }),
  clearTranscript: () =>
    set({ currentTranscript: "", isTranscriptFinal: false }),

  setBlockedReason: (reason, riskLevel) =>
    set({ blockedReason: reason, blockedRiskLevel: riskLevel || null }),

  reset: () => set(initialState),
}));
