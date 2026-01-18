import type {
  CaseData,
  FSMState,
  Intent,
  Message,
  TurnTrace,
  UserSignal,
} from "@/lib/types";

// Demo conversation script step
interface ConversationStep {
  delay: number;
  action: "agent_speak" | "user_speak" | "state_change" | "trace";
  text?: string;
  state?: FSMState;
  trace?: TurnTrace;
}

// Create a trace for demo purposes
function createTrace(
  turnIndex: number,
  userText: string,
  assistantText: string,
  stateBefore: FSMState,
  stateAfter: FSMState,
  intent: Intent,
  signals: UserSignal[] = []
): TurnTrace {
  return {
    turnIndex,
    userText,
    assistantText,
    detectedSignals: signals,
    fsmStateBefore: stateBefore,
    fsmStateAfter: stateAfter,
    policyDecision: {
      allowed: true,
      forcedTransition: null,
      requiredTemplates: [],
      blockedReasons: [],
      riskLevel: "LOW",
    },
    llmInput: {
      caseId: "demo",
      language: "en",
      state: stateBefore,
      userUtterance: userText,
      slots: {},
      allowedIntents: ["PROCEED", "ASK_CLARIFY", "EMPATHIZE"],
      prohibitedTopics: ["threats", "harassment"],
      toolPermissions: [],
      requiredTemplates: [],
    },
    llmOutput: {
      chosenIntent: intent,
      assistantText,
      toolCalls: [],
      confidence: 0.92,
      tokensUsed: Math.floor(Math.random() * 200) + 100,
    },
    validationResult: {
      passed: true,
      failures: [],
      repairsAttempted: 0,
      fallbackUsed: false,
    },
    latencyMs: Math.floor(Math.random() * 300) + 150,
    timestamp: new Date(),
  };
}

// Generate demo script for a case
function getDemoScript(caseData: CaseData): ConversationStep[] {
  const debtorFirstName = caseData.debtorName.split(" ")[0];

  return [
    // Turn 1: Opening
    {
      delay: 500,
      action: "agent_speak",
      text: `Hello, this is a call regarding an important business matter. Am I speaking with ${caseData.debtorName}?`,
    },
    {
      delay: 200,
      action: "trace",
      trace: createTrace(
        1,
        "",
        `Hello, this is a call regarding an important business matter. Am I speaking with ${caseData.debtorName}?`,
        "OPENING",
        "OPENING",
        "PROCEED"
      ),
    },

    // User response
    { delay: 2500, action: "user_speak", text: "Yes, this is he. Who's calling?" },

    // Turn 2: Disclosure
    { delay: 1000, action: "state_change", state: "DISCLOSURE" },
    {
      delay: 300,
      action: "agent_speak",
      text: `This is Alex from Recovery Services calling on behalf of ${caseData.creditorName}. This is an attempt to collect a debt, and any information obtained will be used for that purpose. This call may be recorded for quality assurance.`,
    },
    {
      delay: 200,
      action: "trace",
      trace: createTrace(
        2,
        "Yes, this is he. Who's calling?",
        `This is Alex from Recovery Services calling on behalf of ${caseData.creditorName}...`,
        "OPENING",
        "DISCLOSURE",
        "IDENTIFY_SELF"
      ),
    },

    // User response
    { delay: 3000, action: "user_speak", text: "Okay, what's this about?" },

    // Turn 3: Identity Verification
    { delay: 800, action: "state_change", state: "IDENTITY_VERIFICATION" },
    {
      delay: 300,
      action: "agent_speak",
      text: `For security purposes, I need to verify your identity. Can you please confirm the last four digits of your Social Security Number?`,
    },
    {
      delay: 200,
      action: "trace",
      trace: createTrace(
        3,
        "Okay, what's this about?",
        "For security purposes, I need to verify your identity...",
        "DISCLOSURE",
        "IDENTITY_VERIFICATION",
        "ASK_VERIFICATION"
      ),
    },

    // User verifies
    { delay: 2000, action: "user_speak", text: "It's 4532." },

    // Turn 4: Consent Recording
    { delay: 800, action: "state_change", state: "CONSENT_RECORDING" },
    {
      delay: 300,
      action: "agent_speak",
      text: `Thank you for confirming. ${debtorFirstName}, do I have your consent to record this call?`,
    },
    {
      delay: 200,
      action: "trace",
      trace: createTrace(
        4,
        "It's 4532.",
        `Thank you for confirming. ${debtorFirstName}, do I have your consent to record this call?`,
        "IDENTITY_VERIFICATION",
        "CONSENT_RECORDING",
        "CONFIRM_IDENTITY"
      ),
    },

    // User consents
    { delay: 1500, action: "user_speak", text: "Yes, that's fine." },

    // Turn 5: Debt Context
    { delay: 800, action: "state_change", state: "DEBT_CONTEXT" },
    {
      delay: 300,
      action: "agent_speak",
      text: `Thank you. ${debtorFirstName}, I'm calling about your account with ${caseData.creditorName}. The current balance is $${caseData.amountDue.toLocaleString()}, which is ${caseData.daysPastDue} days past due. I'd like to help you resolve this today.`,
    },
    {
      delay: 200,
      action: "trace",
      trace: createTrace(
        5,
        "Yes, that's fine.",
        `Thank you. ${debtorFirstName}, I'm calling about your account...`,
        "CONSENT_RECORDING",
        "DEBT_CONTEXT",
        "PROCEED",
        ["AGREEMENT"]
      ),
    },

    // User responds
    {
      delay: 3000,
      action: "user_speak",
      text: "I know about the balance. I've been having some financial difficulties lately.",
    },

    // Turn 6: Negotiation
    { delay: 800, action: "state_change", state: "NEGOTIATION" },
    {
      delay: 300,
      action: "agent_speak",
      text: `I understand, ${debtorFirstName}. Many people are facing similar challenges. Let's see what options we have available. Would you be able to make a payment today, or would a payment plan work better for your situation?`,
    },
    {
      delay: 200,
      action: "trace",
      trace: createTrace(
        6,
        "I know about the balance. I've been having some financial difficulties lately.",
        "I understand. Many people are facing similar challenges...",
        "DEBT_CONTEXT",
        "NEGOTIATION",
        "EMPATHIZE"
      ),
    },
  ];
}

// Timeout tracking for cleanup
let demoTimeouts: ReturnType<typeof setTimeout>[] = [];

export interface DemoCallbacks {
  addMessage: (msg: Omit<Message, "id" | "timestamp">) => void;
  setCurrentState: (state: FSMState) => void;
  setTurnTrace: (trace: TurnTrace) => void;
  setAgentSpeaking: (speaking: boolean) => void;
  setUserSpeaking: (speaking: boolean) => void;
}

// Run demo conversation
export function runDemoConversation(caseData: CaseData, callbacks: DemoCallbacks) {
  const { addMessage, setCurrentState, setTurnTrace, setAgentSpeaking, setUserSpeaking } =
    callbacks;

  // Clear any existing timeouts
  demoTimeouts.forEach((t) => clearTimeout(t));
  demoTimeouts = [];

  const script = getDemoScript(caseData);
  let cumulativeDelay = 0;

  script.forEach((step) => {
    cumulativeDelay += step.delay;

    const timeout = setTimeout(() => {
      switch (step.action) {
        case "agent_speak":
          setAgentSpeaking(true);
          addMessage({ role: "agent", text: step.text! });
          // Stop speaking after a bit
          const stopAgentTimeout = setTimeout(() => setAgentSpeaking(false), 1500);
          demoTimeouts.push(stopAgentTimeout);
          break;

        case "user_speak":
          setUserSpeaking(true);
          addMessage({ role: "user", text: step.text! });
          // Stop speaking after a bit
          const stopUserTimeout = setTimeout(() => setUserSpeaking(false), 800);
          demoTimeouts.push(stopUserTimeout);
          break;

        case "state_change":
          setCurrentState(step.state!);
          break;

        case "trace":
          setTurnTrace(step.trace!);
          break;
      }
    }, cumulativeDelay);

    demoTimeouts.push(timeout);
  });
}

// Stop demo conversation
export function stopDemoConversation() {
  demoTimeouts.forEach((t) => clearTimeout(t));
  demoTimeouts = [];
}
