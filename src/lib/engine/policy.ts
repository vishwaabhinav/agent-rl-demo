import type { CaseData, FSMState, PolicyConfig, PolicyOutput } from "../types.ts";

export interface PolicyCheckInput {
  caseData: CaseData;
  config: PolicyConfig;
  currentState: FSMState;
  proposedResponse?: string;
}

export class PolicyEngine {
  // Check if the current time is within the allowed call window
  private checkCallWindow(config: PolicyConfig, timezone: string): { allowed: boolean; reason?: string } {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const currentTime = formatter.format(now);
      const [currentHour, currentMinute] = currentTime.split(":").map(Number);
      const currentMinutes = currentHour * 60 + currentMinute;

      const [startHour, startMinute] = config.callWindowStart.split(":").map(Number);
      const [endHour, endMinute] = config.callWindowEnd.split(":").map(Number);
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;

      if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
        return {
          allowed: false,
          reason: `Outside call window (${config.callWindowStart}-${config.callWindowEnd} ${timezone})`,
        };
      }

      return { allowed: true };
    } catch {
      // If timezone is invalid, allow the call but log
      console.warn(`Invalid timezone: ${timezone}`);
      return { allowed: true };
    }
  }

  // Check daily attempt limit
  private checkDailyLimit(
    caseData: CaseData,
    config: PolicyConfig
  ): { allowed: boolean; reason?: string } {
    if (caseData.attemptCountToday >= config.maxAttemptsPerDay) {
      return {
        allowed: false,
        reason: `Daily attempt limit reached (${caseData.attemptCountToday}/${config.maxAttemptsPerDay})`,
      };
    }
    return { allowed: true };
  }

  // Check total attempt limit
  private checkTotalLimit(
    caseData: CaseData,
    config: PolicyConfig
  ): { allowed: boolean; reason?: string } {
    if (caseData.attemptCountTotal >= config.maxAttemptsTotal) {
      return {
        allowed: false,
        reason: `Total attempt limit reached (${caseData.attemptCountTotal}/${config.maxAttemptsTotal})`,
      };
    }
    return { allowed: true };
  }

  // Check if debtor is on Do Not Call list
  private checkDNCStatus(caseData: CaseData): { allowed: boolean; reason?: string; forcedState?: FSMState } {
    if (caseData.dnc) {
      return {
        allowed: false,
        reason: "Debtor is on Do Not Call list",
        forcedState: "DO_NOT_CALL",
      };
    }
    return { allowed: true };
  }

  // Check recording consent requirement
  private checkRecordingConsent(
    caseData: CaseData,
    config: PolicyConfig,
    currentState: FSMState
  ): { allowed: boolean; reason?: string } {
    // Only check after consent state
    const postConsentStates: FSMState[] = [
      "DEBT_CONTEXT",
      "NEGOTIATION",
      "PAYMENT_SETUP",
      "WRAPUP",
    ];

    if (config.requireRecordingConsent && postConsentStates.includes(currentState)) {
      if (caseData.recordingConsent === false) {
        return {
          allowed: false,
          reason: "Recording consent required but declined",
        };
      }
    }
    return { allowed: true };
  }

  // Check for prohibited phrases in response
  private checkProhibitedPhrases(
    proposedResponse: string | undefined,
    config: PolicyConfig
  ): { allowed: boolean; reason?: string; violations: string[] } {
    if (!proposedResponse) {
      return { allowed: true, violations: [] };
    }

    const lowerResponse = proposedResponse.toLowerCase();
    const violations: string[] = [];

    for (const phrase of config.prohibitedPhrases) {
      if (lowerResponse.includes(phrase.toLowerCase())) {
        violations.push(phrase);
      }
    }

    if (violations.length > 0) {
      return {
        allowed: false,
        reason: `Response contains prohibited phrases: ${violations.join(", ")}`,
        violations,
      };
    }

    return { allowed: true, violations: [] };
  }

  // Determine risk level based on case data and state
  private determineRiskLevel(
    caseData: CaseData,
    currentState: FSMState
  ): "LOW" | "MEDIUM" | "HIGH" {
    // High risk conditions
    if (caseData.disputed || caseData.dnc || caseData.wrongParty) {
      return "HIGH";
    }

    // Medium risk conditions
    if (
      caseData.attemptCountTotal > 10 ||
      caseData.daysPastDue > 120 ||
      ["DISPUTE_FLOW", "ESCALATE_HUMAN", "DO_NOT_CALL"].includes(currentState)
    ) {
      return "MEDIUM";
    }

    return "LOW";
  }

  // Get required templates for current state
  private getRequiredTemplates(currentState: FSMState, config: PolicyConfig): string[] {
    const templates: string[] = [];

    if (currentState === "DISCLOSURE") {
      templates.push("MINI_MIRANDA"); // Required disclosure statement
    }

    if (currentState === "CONSENT_RECORDING" && config.requireRecordingConsent) {
      templates.push("RECORDING_CONSENT");
    }

    if (currentState === "DO_NOT_CALL") {
      templates.push("DNC_ACKNOWLEDGMENT");
    }

    if (currentState === "DISPUTE_FLOW") {
      templates.push("DISPUTE_ACKNOWLEDGMENT");
    }

    return templates;
  }

  // Main evaluation method
  evaluate(input: PolicyCheckInput): PolicyOutput {
    const { caseData, config, currentState, proposedResponse } = input;
    const blockedReasons: string[] = [];
    let forcedTransition: FSMState | null = null;

    // Run all checks
    const callWindowCheck = this.checkCallWindow(config, caseData.timezone);
    if (!callWindowCheck.allowed) {
      blockedReasons.push(callWindowCheck.reason!);
    }

    const dailyLimitCheck = this.checkDailyLimit(caseData, config);
    if (!dailyLimitCheck.allowed) {
      blockedReasons.push(dailyLimitCheck.reason!);
    }

    const totalLimitCheck = this.checkTotalLimit(caseData, config);
    if (!totalLimitCheck.allowed) {
      blockedReasons.push(totalLimitCheck.reason!);
    }

    const dncCheck = this.checkDNCStatus(caseData);
    if (!dncCheck.allowed) {
      blockedReasons.push(dncCheck.reason!);
      if (dncCheck.forcedState) {
        forcedTransition = dncCheck.forcedState;
      }
    }

    const consentCheck = this.checkRecordingConsent(caseData, config, currentState);
    if (!consentCheck.allowed) {
      blockedReasons.push(consentCheck.reason!);
    }

    const phraseCheck = this.checkProhibitedPhrases(proposedResponse, config);
    if (!phraseCheck.allowed) {
      blockedReasons.push(phraseCheck.reason!);
    }

    // Check for disputed case
    if (caseData.disputed && !["DISPUTE_FLOW", "END_CALL"].includes(currentState)) {
      forcedTransition = "DISPUTE_FLOW";
    }

    // Check for wrong party
    if (caseData.wrongParty && !["WRONG_PARTY_FLOW", "END_CALL"].includes(currentState)) {
      forcedTransition = "WRONG_PARTY_FLOW";
    }

    return {
      allowed: blockedReasons.length === 0,
      forcedTransition,
      requiredTemplates: this.getRequiredTemplates(currentState, config),
      blockedReasons,
      riskLevel: this.determineRiskLevel(caseData, currentState),
    };
  }

  // Validate a proposed response before sending
  validateResponse(response: string, config: PolicyConfig): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for prohibited phrases
    const phraseCheck = this.checkProhibitedPhrases(response, config);
    if (!phraseCheck.allowed) {
      issues.push(...phraseCheck.violations.map((v) => `Prohibited phrase: "${v}"`));
    }

    // Check for overly aggressive language patterns
    const aggressivePatterns = [
      /you must pay/i,
      /you will be/i,
      /we will take/i,
      /immediately/i,
      /right now/i,
    ];

    for (const pattern of aggressivePatterns) {
      if (pattern.test(response)) {
        issues.push(`Potentially aggressive language: "${pattern.source}"`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

// Export singleton instance
export const policyEngine = new PolicyEngine();
