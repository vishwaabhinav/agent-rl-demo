/**
 * Types for RL Dashboard UI
 */

export interface LearningCurvePoint {
  episode: number;
  trainReturn: number;
  evalReturn?: number;
  evalSuccessRate?: number;
}

export interface EvalResult {
  episode: number;
  metrics: AggregateMetrics;
}

export interface AggregateMetrics {
  numEpisodes: number;
  avgReturn: number;
  stdReturn: number;
  successRate: number;
  partialSuccessRate: number;
  avgLength: number;
  hangupRate: number;
  escalationRate: number;
}

export interface ExperimentResults {
  learningCurve: LearningCurvePoint[];
  evalResults: EvalResult[];
  finalMetrics: AggregateMetrics;
  trainTimeMs: number;
  numEpisodes: number;
  learnerState: string;
}

export interface PersonaConfig {
  name: string;
  willingnessToPay: "LOW" | "MEDIUM" | "HIGH";
  financialSituation: "STABLE" | "STRUGGLING" | "HARDSHIP";
  temperament: "COOPERATIVE" | "NEUTRAL" | "HOSTILE";
  debtKnowledge: "AWARE" | "CONFUSED" | "DISPUTING";
  patience: number;
}

export interface Transition {
  state: RLStateUI;
  action: string;
  reward: number;
  nextState: RLStateUI;
  done: boolean;
  info: StepInfo;
}

export interface RLStateUI {
  fsmState: string;
  turnCount: number;
  timeInState: number;
  debtBucket: string;
  daysPastDueBucket: string;
  priorAttempts: number;
  identityVerified: boolean;
  disclosureComplete: boolean;
  lastSignal: string | null;
  sentiment: string;
  objectionsRaised: number;
  offersMade: number;
}

export interface StepInfo {
  fsmTransition: {
    from: string;
    to: string;
    wasForced: boolean;
    reason: string;
  };
  agentUtterance: string;
  borrowerResponse: string;
  detectedSignals: string[];
  terminalReason?: string;
  rewardBreakdown: {
    shaping: number;
    terminal: number;
    turnPenalty: number;
    total: number;
  };
}

export interface Episode {
  episodeId: number;
  return_: number;
  length: number;
  outcome: string;
  persona: PersonaConfig;
  trajectory: {
    transitions: Transition[];
    totalReturn: number;
    length: number;
    outcome: string;
    persona: PersonaConfig;
  };
  timestamp: string;
}

export interface QValueEntry {
  stateKey: string;
  fsmState: string;
  actionValues: Record<string, number>;
}

export interface PolicyData {
  type: "bandit" | "qlearning";
  qValues?: QValueEntry[];
  actionScores?: Record<string, number[]>;
  greedyPolicy: Record<string, string>;
  episodesTrained: number;
}

// Sample data for demo/testing
export const SAMPLE_LEARNING_CURVE: LearningCurvePoint[] = Array.from(
  { length: 100 },
  (_, i) => ({
    episode: i + 1,
    trainReturn: -1 + Math.random() * 0.5 + i * 0.008,
    evalReturn: i % 25 === 24 ? -0.8 + i * 0.006 : undefined,
    evalSuccessRate: i % 25 === 24 ? Math.min(0.3, i * 0.003) : undefined,
  })
);

export const SAMPLE_METRICS: AggregateMetrics = {
  numEpisodes: 100,
  avgReturn: -0.25,
  stdReturn: 0.15,
  successRate: 0.12,
  partialSuccessRate: 0.28,
  avgLength: 8.5,
  hangupRate: 0.15,
  escalationRate: 0.05,
};
