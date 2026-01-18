import type { CaseData, FSMState, Message, PolicyConfig, TurnTrace } from "@/lib/types";
import { TurnProcessor, createProcessor } from "@/lib/engine/processor";

export interface Session {
  id: string;
  caseData: CaseData;
  policyConfig: PolicyConfig;
  processor: TurnProcessor;
  messages: Message[];
  traces: TurnTrace[];
  currentState: FSMState;
  stateHistory: FSMState[];
  createdAt: Date;
  updatedAt: Date;
  status: "active" | "ended";
}

export interface SessionSummary {
  sessionId: string;
  caseId: string;
  debtorName: string;
  finalState: FSMState;
  turnCount: number;
  duration: number;
  outcome: string;
}

class SessionManager {
  private sessions: Map<string, Session> = new Map();

  // Create a new session
  create(caseData: CaseData, policyConfig: PolicyConfig): Session {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const session: Session = {
      id: sessionId,
      caseData,
      policyConfig,
      processor: createProcessor(caseData, policyConfig),
      messages: [],
      traces: [],
      currentState: "OPENING",
      stateHistory: ["OPENING"],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "active",
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  // Get a session by ID
  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  // Check if session exists
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  // Add a message to the session
  addMessage(sessionId: string, role: "user" | "agent", text: string): Message | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      text,
      timestamp: new Date(),
    };

    session.messages.push(message);
    session.updatedAt = new Date();
    return message;
  }

  // Add a trace to the session
  addTrace(sessionId: string, trace: TurnTrace): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.traces.push(trace);
    session.updatedAt = new Date();
  }

  // Update the session state
  updateState(sessionId: string, newState: FSMState): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.currentState = newState;
    if (!session.stateHistory.includes(newState) || session.stateHistory[session.stateHistory.length - 1] !== newState) {
      session.stateHistory.push(newState);
    }
    session.updatedAt = new Date();
  }

  // Process a user message and get agent response
  async processMessage(sessionId: string, userText: string): Promise<{
    agentMessage: Message | null;
    trace: TurnTrace | null;
    newState: FSMState;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") {
      return { agentMessage: null, trace: null, newState: "END_CALL" };
    }

    // Add user message
    this.addMessage(sessionId, "user", userText);

    // Process turn
    const result = await session.processor.processTurn(userText);

    // Add agent message
    const agentMessage = this.addMessage(sessionId, "agent", result.responseText);

    // Add trace
    this.addTrace(sessionId, result.trace);

    // Update state
    this.updateState(sessionId, result.newState);

    return {
      agentMessage,
      trace: result.trace,
      newState: result.newState,
    };
  }

  // Generate opening message for a session
  async generateOpening(sessionId: string): Promise<{
    agentMessage: Message | null;
    trace: TurnTrace | null;
    newState: FSMState;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") {
      return { agentMessage: null, trace: null, newState: "OPENING" };
    }

    // Process opening turn (empty user text)
    const result = await session.processor.generateOpening();

    // Add agent message
    const agentMessage = this.addMessage(sessionId, "agent", result.responseText);

    // Add trace
    this.addTrace(sessionId, result.trace);

    return {
      agentMessage,
      trace: result.trace,
      newState: result.newState,
    };
  }

  // End a session
  end(sessionId: string): SessionSummary | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.status = "ended";
    session.updatedAt = new Date();

    const duration = session.updatedAt.getTime() - session.createdAt.getTime();
    const outcome = this.determineOutcome(session);

    return {
      sessionId: session.id,
      caseId: session.caseData.id,
      debtorName: session.caseData.debtorName,
      finalState: session.currentState,
      turnCount: session.traces.length,
      duration,
      outcome,
    };
  }

  // Delete a session
  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  // Get all active sessions
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === "active");
  }

  // Get session count
  getSessionCount(): number {
    return this.sessions.size;
  }

  // Cleanup old sessions (older than maxAge in ms)
  cleanup(maxAge: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (now - session.updatedAt.getTime() > maxAge) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  private determineOutcome(session: Session): string {
    const finalState = session.currentState;

    switch (finalState) {
      case "END_CALL":
        // Check traces to determine if payment was discussed
        const paymentDiscussed = session.traces.some(
          (t) => t.fsmStateAfter === "PAYMENT_SETUP" || t.fsmStateAfter === "WRAPUP"
        );
        return paymentDiscussed ? "Payment arrangement discussed" : "Call completed";

      case "PAYMENT_SETUP":
      case "WRAPUP":
        return "Payment arrangement made";

      case "DISPUTE_FLOW":
        return "Debt disputed";

      case "DO_NOT_CALL":
        return "DNC requested";

      case "WRONG_PARTY_FLOW":
        return "Wrong party";

      case "ESCALATE_HUMAN":
        return "Escalated to supervisor";

      default:
        return "Call in progress";
    }
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();

// Export class for testing
export { SessionManager };
