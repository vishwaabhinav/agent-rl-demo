/**
 * Unified Agent Integration Tests
 */

import { UnifiedAgent } from "../unified-agent";
import type { AgentConfig } from "../types";
import type { CaseData, PolicyConfig } from "../../types";

// Mock the LLM client to avoid actual API calls
jest.mock("../../llm/client", () => ({
  getOpenAIClient: () => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: "Hello, this is a test response." } }],
        }),
      },
    },
  }),
}));

const TEST_CASE: CaseData = {
  id: "test-001",
  debtorName: "John Smith",
  debtorPhone: "555-123-4567",
  creditorName: "ABC Collections",
  amountDue: 2500.0,
  daysPastDue: 90,
  jurisdiction: "CA",
  timezone: "America/Los_Angeles",
  language: "en",
  dnc: false,
  disputed: false,
  wrongParty: false,
  recordingConsent: null,
  identityVerified: null,
  attemptCountToday: 0,
  attemptCountTotal: 2,
};

const TEST_POLICY: PolicyConfig = {
  jurisdiction: "CA",
  callWindowStart: "08:00",
  callWindowEnd: "21:00",
  maxAttemptsPerDay: 3,
  maxAttemptsTotal: 10,
  prohibitedPhrases: [],
  requireRecordingConsent: true,
};

describe("UnifiedAgent", () => {
  describe("text mode, autonomous", () => {
    it("should initialize in OPENING state", () => {
      const config: AgentConfig = {
        mode: "text",
        policyMode: "autonomous",
        caseData: TEST_CASE,
        policyConfig: TEST_POLICY,
      };

      const agent = new UnifiedAgent(config);
      expect(agent.getFSMState()).toBe("OPENING");
      expect(agent.isTerminal()).toBe(false);
    });

    it("should process turn and return result", async () => {
      const config: AgentConfig = {
        mode: "text",
        policyMode: "autonomous",
        caseData: TEST_CASE,
        policyConfig: TEST_POLICY,
      };

      const agent = new UnifiedAgent(config);
      const result = await agent.processTurn("Hello, yes this is John.");

      expect(result.agentUtterance).toBeTruthy();
      expect(result.action).toBeTruthy();
      expect(result.fsmState).toBeTruthy();
    });

    it("should detect DNC signal and transition to terminal state", async () => {
      const config: AgentConfig = {
        mode: "text",
        policyMode: "autonomous",
        caseData: TEST_CASE,
        policyConfig: TEST_POLICY,
      };

      const agent = new UnifiedAgent(config);
      await agent.processTurn("Stop calling me! Do not call again!");

      expect(agent.getFSMState()).toBe("DO_NOT_CALL");
      expect(agent.isTerminal()).toBe(true);
    });

    it("should reset to initial state", async () => {
      const config: AgentConfig = {
        mode: "text",
        policyMode: "autonomous",
        caseData: TEST_CASE,
        policyConfig: TEST_POLICY,
      };

      const agent = new UnifiedAgent(config);
      await agent.processTurn("Hello");

      agent.reset();

      expect(agent.getFSMState()).toBe("OPENING");
      expect(agent.isTerminal()).toBe(false);
    });
  });

  describe("text mode, rl-controlled", () => {
    it("should use learner to select actions", async () => {
      const mockLearner = {
        selectAction: jest.fn().mockReturnValue("EMPATHIZE"),
        update: jest.fn(),
        reset: jest.fn(),
        save: jest.fn().mockReturnValue("{}"),
        load: jest.fn(),
      };

      const config: AgentConfig = {
        mode: "text",
        policyMode: "rl-controlled",
        caseData: TEST_CASE,
        policyConfig: TEST_POLICY,
        learner: mockLearner,
      };

      const agent = new UnifiedAgent(config);
      const result = await agent.processTurn("I'm not sure about this.");

      expect(mockLearner.selectAction).toHaveBeenCalled();
      // The action should be what the learner returned
      // Note: If EMPATHIZE isn't available in OPENING state, it will use the heuristic
    });
  });

  describe("available actions", () => {
    it("should return correct actions for OPENING state", () => {
      const config: AgentConfig = {
        mode: "text",
        policyMode: "autonomous",
        caseData: TEST_CASE,
        policyConfig: TEST_POLICY,
      };

      const agent = new UnifiedAgent(config);
      const actions = agent.getAvailableActions();

      expect(actions).toContain("PROCEED");
    });
  });
});
