import type { LLMOutput, PolicyConfig, ValidationResult, ValidationFailure, Intent } from "../types.ts";

export interface ValidatorInput {
  llmOutput: LLMOutput;
  allowedIntents: Intent[];
  config: PolicyConfig;
}

// Check if the chosen intent is in the allowed list
function validateIntent(llmOutput: LLMOutput, allowedIntents: Intent[]): ValidationFailure | null {
  if (!allowedIntents.includes(llmOutput.chosenIntent)) {
    return {
      validator: "intent",
      detail: `Intent "${llmOutput.chosenIntent}" is not allowed in current state. Allowed: ${allowedIntents.join(", ")}`,
    };
  }
  return null;
}

// Check for prohibited phrases in response
function validateProhibitedPhrases(
  llmOutput: LLMOutput,
  config: PolicyConfig
): ValidationFailure | null {
  const lowerText = llmOutput.assistantText.toLowerCase();

  for (const phrase of config.prohibitedPhrases) {
    if (lowerText.includes(phrase.toLowerCase())) {
      return {
        validator: "prohibited_phrase",
        detail: `Response contains prohibited phrase: "${phrase}"`,
      };
    }
  }
  return null;
}

// Check response length constraints
function validateResponseLength(llmOutput: LLMOutput): ValidationFailure | null {
  const minLength = 10;
  const maxLength = 500;

  if (llmOutput.assistantText.length < minLength) {
    return {
      validator: "length",
      detail: `Response too short (${llmOutput.assistantText.length} chars, min ${minLength})`,
    };
  }

  if (llmOutput.assistantText.length > maxLength) {
    return {
      validator: "length",
      detail: `Response too long (${llmOutput.assistantText.length} chars, max ${maxLength})`,
    };
  }

  return null;
}

// Check for aggressive or threatening language
function validateTone(llmOutput: LLMOutput): ValidationFailure | null {
  const aggressivePatterns = [
    { pattern: /you must pay immediately/i, reason: "Demanding immediate payment" },
    { pattern: /we will sue you/i, reason: "Threatening legal action" },
    { pattern: /you have no choice/i, reason: "Removing agency" },
    { pattern: /you're lying/i, reason: "Accusatory language" },
    { pattern: /don't hang up/i, reason: "Pressuring to stay on call" },
  ];

  for (const { pattern, reason } of aggressivePatterns) {
    if (pattern.test(llmOutput.assistantText)) {
      return {
        validator: "tone",
        detail: `Aggressive language detected: ${reason}`,
      };
    }
  }

  return null;
}

// Check that response is coherent (basic checks)
function validateCoherence(llmOutput: LLMOutput): ValidationFailure | null {
  const text = llmOutput.assistantText;

  // Check for empty or whitespace-only
  if (!text.trim()) {
    return {
      validator: "coherence",
      detail: "Response is empty or whitespace-only",
    };
  }

  // Check for obvious errors like repeated characters
  if (/(.)\1{10,}/.test(text)) {
    return {
      validator: "coherence",
      detail: "Response contains excessive character repetition",
    };
  }

  // Check for placeholder text
  const placeholders = ["[NAME]", "[AMOUNT]", "{placeholder}", "TODO", "FIXME"];
  for (const placeholder of placeholders) {
    if (text.includes(placeholder)) {
      return {
        validator: "coherence",
        detail: `Response contains placeholder text: "${placeholder}"`,
      };
    }
  }

  return null;
}

// Check confidence threshold
function validateConfidence(llmOutput: LLMOutput): ValidationFailure | null {
  const minConfidence = 0.3;

  if (llmOutput.confidence < minConfidence) {
    return {
      validator: "confidence",
      detail: `LLM confidence too low (${llmOutput.confidence.toFixed(2)}, min ${minConfidence})`,
    };
  }

  return null;
}

// Main validation function
export function validateOutput(input: ValidatorInput): ValidationResult {
  const { llmOutput, allowedIntents, config } = input;
  const failures: ValidationFailure[] = [];

  // Run all validators
  const validators = [
    () => validateIntent(llmOutput, allowedIntents),
    () => validateProhibitedPhrases(llmOutput, config),
    () => validateResponseLength(llmOutput),
    () => validateTone(llmOutput),
    () => validateCoherence(llmOutput),
    () => validateConfidence(llmOutput),
  ];

  for (const validator of validators) {
    const failure = validator();
    if (failure) {
      failures.push(failure);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    repairsAttempted: 0,
    fallbackUsed: false,
  };
}

// Attempt to repair a failed response
export function attemptRepair(
  llmOutput: LLMOutput,
  failures: ValidationFailure[],
  config: PolicyConfig
): { repaired: LLMOutput; success: boolean } {
  let repairedText = llmOutput.assistantText;
  let repairCount = 0;

  for (const failure of failures) {
    if (failure.validator === "prohibited_phrase") {
      // Try to remove/replace prohibited phrases
      for (const phrase of config.prohibitedPhrases) {
        const regex = new RegExp(phrase, "gi");
        if (regex.test(repairedText)) {
          repairedText = repairedText.replace(regex, "");
          repairCount++;
        }
      }
    }

    if (failure.validator === "length" && repairedText.length > 500) {
      // Truncate if too long
      repairedText = repairedText.substring(0, 497) + "...";
      repairCount++;
    }
  }

  // Clean up any double spaces from removal
  repairedText = repairedText.replace(/\s+/g, " ").trim();

  const repaired: LLMOutput = {
    ...llmOutput,
    assistantText: repairedText,
  };

  // Re-validate
  const revalidation = validateOutput({
    llmOutput: repaired,
    allowedIntents: [], // Skip intent validation for repair
    config,
  });

  return {
    repaired,
    success: revalidation.passed || repairCount > 0,
  };
}

// Generate a safe fallback response for the given state
export function getFallbackResponse(state: string): string {
  const fallbacks: Record<string, string> = {
    OPENING: "Hello, thank you for taking my call. May I speak with the account holder?",
    DISCLOSURE:
      "This is a call from a debt collection agency. This is an attempt to collect a debt and any information obtained will be used for that purpose.",
    IDENTITY_VERIFICATION:
      "For security purposes, I need to verify some information. Can you please confirm your identity?",
    CONSENT_RECORDING:
      "This call may be recorded for quality and training purposes. Do I have your consent to continue?",
    DEBT_CONTEXT:
      "I'm calling regarding an outstanding balance on your account. I'd like to discuss some options with you.",
    NEGOTIATION:
      "I understand this may be a difficult situation. Let's work together to find a solution that works for you.",
    PAYMENT_SETUP:
      "Thank you for working with us. Let me help you set up a payment arrangement.",
    WRAPUP:
      "Thank you for your time today. Is there anything else I can help you with before we end the call?",
    DISPUTE_FLOW:
      "I understand you'd like to dispute this debt. I'm noting your dispute and will provide you with the necessary information.",
    WRONG_PARTY_FLOW:
      "I apologize for the confusion. It seems I may have reached the wrong person. Thank you for your time.",
    DO_NOT_CALL:
      "I understand you don't wish to be contacted. I'm adding your number to our do not call list. Thank you.",
    ESCALATE_HUMAN:
      "I understand. Let me connect you with a supervisor who can better assist you.",
    END_CALL: "Thank you for your time. Have a good day.",
  };

  return fallbacks[state] || "Thank you for your patience. How may I assist you?";
}
