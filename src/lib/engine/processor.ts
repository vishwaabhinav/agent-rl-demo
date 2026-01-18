import type {
  CaseData,
  FSMState,
  LLMInput,
  LLMOutput,
  PolicyConfig,
  PolicyOutput,
  TurnTrace,
  UserSignal,
  ValidationResult,
} from "../types.ts";
import { FSMEngine, STATE_ALLOWED_INTENTS } from "./fsm.ts";
import { policyEngine } from "./policy.ts";
import { validateOutput, attemptRepair, getFallbackResponse } from "./validators.ts";
import { generateResponse } from "../llm/client.ts";
import { detectSignals } from "../llm/prompts.ts";

export interface ProcessorContext {
  fsm: FSMEngine;
  caseData: CaseData;
  policyConfig: PolicyConfig;
  turnIndex: number;
}

export interface ProcessTurnResult {
  trace: TurnTrace;
  newState: FSMState;
  responseText: string;
}

const MAX_REPAIR_ATTEMPTS = 2;

export class TurnProcessor {
  private context: ProcessorContext;

  constructor(
    caseData: CaseData,
    policyConfig: PolicyConfig,
    initialState: FSMState = "OPENING"
  ) {
    this.context = {
      fsm: new FSMEngine(initialState),
      caseData,
      policyConfig,
      turnIndex: 0,
    };
  }

  getContext(): ProcessorContext {
    return this.context;
  }

  getCurrentState(): FSMState {
    return this.context.fsm.getCurrentState();
  }

  // Process a user's turn and generate agent response
  async processTurn(userText: string): Promise<ProcessTurnResult> {
    const startTime = Date.now();
    this.context.turnIndex++;

    const stateBefore = this.context.fsm.getCurrentState();

    // Step 1: Detect user signals
    const detectedSignals = detectSignals(userText) as UserSignal[];

    // Step 2: Check for forced transitions from signals
    const forcedState = this.context.fsm.checkForcedTransition(detectedSignals);

    // Step 3: Evaluate policy
    const policyDecision = policyEngine.evaluate({
      caseData: this.context.caseData,
      config: this.context.policyConfig,
      currentState: stateBefore,
    });

    // Step 4: Determine effective state (apply forced transitions)
    let effectiveState = stateBefore;
    if (forcedState) {
      this.context.fsm.forceTransition(forcedState, `Signal detected: ${detectedSignals.join(", ")}`);
      effectiveState = forcedState;
    } else if (policyDecision.forcedTransition) {
      this.context.fsm.forceTransition(policyDecision.forcedTransition, "Policy-forced transition");
      effectiveState = policyDecision.forcedTransition;
    }

    // Step 5: Build LLM input
    const llmInput = this.buildLLMInput(userText, effectiveState, policyDecision);

    // Step 6: Generate response via LLM
    let llmOutput: LLMOutput;
    let validationResult: ValidationResult;
    let repairsAttempted = 0;
    let fallbackUsed = false;

    if (!policyDecision.allowed) {
      // If policy blocks the call, use a fallback
      llmOutput = {
        chosenIntent: "PROCEED",
        assistantText: this.getPolicyBlockedMessage(policyDecision),
        toolCalls: [],
        confidence: 1.0,
        tokensUsed: 0,
      };
      validationResult = { passed: true, failures: [], repairsAttempted: 0, fallbackUsed: true };
      fallbackUsed = true;
    } else {
      // Generate LLM response
      llmOutput = await generateResponse(llmInput, this.context.caseData);

      // Step 7: Validate output
      validationResult = validateOutput({
        llmOutput,
        allowedIntents: llmInput.allowedIntents,
        config: this.context.policyConfig,
      });

      // Step 8: Attempt repairs if validation fails
      while (!validationResult.passed && repairsAttempted < MAX_REPAIR_ATTEMPTS) {
        repairsAttempted++;
        const repair = attemptRepair(llmOutput, validationResult.failures, this.context.policyConfig);
        if (repair.success) {
          llmOutput = repair.repaired;
          validationResult = validateOutput({
            llmOutput,
            allowedIntents: llmInput.allowedIntents,
            config: this.context.policyConfig,
          });
        } else {
          break;
        }
      }

      // Step 9: Use fallback if still failing
      if (!validationResult.passed) {
        llmOutput = {
          ...llmOutput,
          assistantText: getFallbackResponse(effectiveState),
        };
        fallbackUsed = true;
        validationResult = {
          ...validationResult,
          fallbackUsed: true,
          repairsAttempted,
        };
      }
    }

    // Step 10: Apply FSM transition if not already forced
    let stateAfter = this.context.fsm.getCurrentState();
    if (!forcedState && !policyDecision.forcedTransition) {
      // Check if we should advance based on the conversation
      const shouldAdvance = this.shouldAdvanceState(userText, llmOutput, detectedSignals);
      if (shouldAdvance) {
        const transition = this.context.fsm.transition(detectedSignals);
        stateAfter = transition.newState;
      }
    } else {
      stateAfter = effectiveState;
    }

    // Update slots based on conversation
    this.updateSlots(userText, llmOutput, stateAfter);

    // Build the trace
    const trace: TurnTrace = {
      turnIndex: this.context.turnIndex,
      userText,
      assistantText: llmOutput.assistantText,
      detectedSignals,
      fsmStateBefore: stateBefore,
      fsmStateAfter: stateAfter,
      policyDecision,
      llmInput,
      llmOutput,
      validationResult: {
        ...validationResult,
        repairsAttempted,
        fallbackUsed,
      },
      latencyMs: Date.now() - startTime,
      timestamp: new Date(),
    };

    return {
      trace,
      newState: stateAfter,
      responseText: llmOutput.assistantText,
    };
  }

  // Generate the opening message for the call
  async generateOpening(): Promise<ProcessTurnResult> {
    return this.processTurn("");
  }

  private buildLLMInput(
    userUtterance: string,
    currentState: FSMState,
    policyDecision: PolicyOutput
  ): LLMInput {
    return {
      caseId: this.context.caseData.id,
      language: this.context.caseData.language,
      state: currentState,
      userUtterance,
      slots: this.context.fsm.getContext().slots,
      allowedIntents: STATE_ALLOWED_INTENTS[currentState] || ["PROCEED"],
      prohibitedTopics: this.context.policyConfig.prohibitedPhrases,
      toolPermissions: [],
      requiredTemplates: policyDecision.requiredTemplates,
    };
  }

  private shouldAdvanceState(
    userText: string,
    llmOutput: LLMOutput,
    signals: UserSignal[]
  ): boolean {
    const state = this.context.fsm.getCurrentState();

    // State-specific advancement logic
    switch (state) {
      case "OPENING":
        // Advance if user confirms identity or responds positively
        return signals.includes("AGREEMENT") || /yes|speaking|this is/i.test(userText);

      case "DISCLOSURE":
        // Advance after disclosure is delivered
        return true;

      case "IDENTITY_VERIFICATION":
        // Advance if identity seems verified
        return /\d{4}|confirm|correct|yes/i.test(userText);

      case "CONSENT_RECORDING":
        // Advance if consent given or declined
        return signals.includes("AGREEMENT") || signals.includes("REFUSAL") || /yes|no|okay|fine/i.test(userText);

      case "DEBT_CONTEXT":
        // Advance after explaining the debt
        return true;

      case "NEGOTIATION":
        // Advance if agreement reached or payment discussed
        return /pay|plan|agree|ok|deal|set.*up/i.test(userText) || signals.includes("AGREEMENT");

      case "PAYMENT_SETUP":
        // Advance after payment is confirmed
        return /confirm|done|set|ready/i.test(userText);

      case "WRAPUP":
        // Advance to end
        return true;

      default:
        // Branch states and terminal states don't auto-advance
        return false;
    }
  }

  private updateSlots(userText: string, llmOutput: LLMOutput, newState: FSMState): void {
    const fsm = this.context.fsm;

    // Track identity verification
    if (newState === "CONSENT_RECORDING" && fsm.getSlot("identityVerified") === undefined) {
      fsm.setSlot("identityVerified", true);
    }

    // Track recording consent
    if (newState === "DEBT_CONTEXT" && fsm.getSlot("recordingConsent") === undefined) {
      const agreed = /yes|okay|fine|consent|agree/i.test(userText);
      fsm.setSlot("recordingConsent", agreed);
    }

    // Track payment agreement
    if (/\$?\d+/.test(userText) && (newState === "NEGOTIATION" || newState === "PAYMENT_SETUP")) {
      const amountMatch = userText.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      if (amountMatch) {
        fsm.setSlot("discussedAmount", amountMatch[1].replace(/,/g, ""));
      }
    }
  }

  private getPolicyBlockedMessage(policyDecision: PolicyOutput): string {
    if (policyDecision.blockedReasons.some(r => r.includes("DNC"))) {
      return "I apologize, but our records show you've requested not to be contacted. I'll make sure this is respected. Have a good day.";
    }

    if (policyDecision.blockedReasons.some(r => r.includes("call window"))) {
      return "I apologize for calling at an inconvenient time. We'll reach out during appropriate hours. Thank you.";
    }

    if (policyDecision.blockedReasons.some(r => r.includes("attempt limit"))) {
      return "Thank you for your time. We'll follow up at a later date. Have a good day.";
    }

    return "I apologize, but I'm unable to continue this call at this time. Thank you for your time.";
  }

  // Reset the processor for a new call
  reset(): void {
    this.context.fsm.reset();
    this.context.turnIndex = 0;
  }
}

// Factory function
export function createProcessor(
  caseData: CaseData,
  policyConfig: PolicyConfig,
  initialState: FSMState = "OPENING"
): TurnProcessor {
  return new TurnProcessor(caseData, policyConfig, initialState);
}
