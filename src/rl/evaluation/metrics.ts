/**
 * Evaluation Metrics
 *
 * Compute aggregate metrics from episode results.
 */

import type {
  EpisodeMetrics,
  AggregateMetrics,
  Trajectory,
  TerminalReason,
  PersonaConfig,
  LearningCurvePoint,
} from "../types";

/**
 * Compute aggregate metrics from a list of episodes.
 */
export function computeMetrics(episodes: EpisodeMetrics[]): AggregateMetrics {
  if (episodes.length === 0) {
    return {
      numEpisodes: 0,
      avgReturn: 0,
      stdReturn: 0,
      successRate: 0,
      partialSuccessRate: 0,
      avgLength: 0,
      hangupRate: 0,
      escalationRate: 0,
    };
  }

  const n = episodes.length;
  const returns = episodes.map((e) => e.return_);

  // Average return
  const avgReturn = returns.reduce((a, b) => a + b, 0) / n;

  // Standard deviation
  const variance = returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / n;
  const stdReturn = Math.sqrt(variance);

  // Success rate (payment setup complete)
  const successOutcomes: TerminalReason[] = ["PAYMENT_SETUP_COMPLETE"];
  const successCount = episodes.filter((e) =>
    successOutcomes.includes(e.outcome)
  ).length;
  const successRate = successCount / n;

  // Partial success rate (includes promise-to-pay, callback)
  const partialSuccessOutcomes: TerminalReason[] = [
    "PAYMENT_SETUP_COMPLETE",
    "PROMISE_TO_PAY",
    "CALLBACK_SCHEDULED",
  ];
  const partialSuccessCount = episodes.filter((e) =>
    partialSuccessOutcomes.includes(e.outcome)
  ).length;
  const partialSuccessRate = partialSuccessCount / n;

  // Average episode length
  const avgLength = episodes.reduce((sum, e) => sum + e.length, 0) / n;

  // Hangup rate
  const hangupOutcomes: TerminalReason[] = ["BORROWER_HANGUP"];
  const hangupCount = episodes.filter((e) =>
    hangupOutcomes.includes(e.outcome)
  ).length;
  const hangupRate = hangupCount / n;

  // Escalation rate
  const escalationOutcomes: TerminalReason[] = ["ESCALATE_HUMAN"];
  const escalationCount = episodes.filter((e) =>
    escalationOutcomes.includes(e.outcome)
  ).length;
  const escalationRate = escalationCount / n;

  return {
    numEpisodes: n,
    avgReturn,
    stdReturn,
    successRate,
    partialSuccessRate,
    avgLength,
    hangupRate,
    escalationRate,
  };
}

/**
 * Compute metrics grouped by persona type.
 */
export function computeMetricsByPersona(
  episodes: EpisodeMetrics[]
): Map<string, AggregateMetrics> {
  // Group episodes by persona name
  const grouped = new Map<string, EpisodeMetrics[]>();

  for (const ep of episodes) {
    const key = ep.persona.name;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(ep);
  }

  // Compute metrics for each group
  const result = new Map<string, AggregateMetrics>();
  grouped.forEach((eps, personaName) => {
    result.set(personaName, computeMetrics(eps));
  });

  return result;
}

/**
 * Compute metrics grouped by temperament.
 */
export function computeMetricsByTemperament(
  episodes: EpisodeMetrics[]
): Map<string, AggregateMetrics> {
  const grouped = new Map<string, EpisodeMetrics[]>();

  for (const ep of episodes) {
    const key = ep.persona.temperament;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(ep);
  }

  const result = new Map<string, AggregateMetrics>();
  grouped.forEach((eps, temperament) => {
    result.set(temperament, computeMetrics(eps));
  });

  return result;
}

/**
 * Compute metrics grouped by willingness to pay.
 */
export function computeMetricsByWillingness(
  episodes: EpisodeMetrics[]
): Map<string, AggregateMetrics> {
  const grouped = new Map<string, EpisodeMetrics[]>();

  for (const ep of episodes) {
    const key = ep.persona.willingnessToPay;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(ep);
  }

  const result = new Map<string, AggregateMetrics>();
  grouped.forEach((eps, willingness) => {
    result.set(willingness, computeMetrics(eps));
  });

  return result;
}

/**
 * Compute rolling average for learning curve smoothing.
 */
export function computeRollingAverage(
  values: number[],
  windowSize: number
): number[] {
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = values.slice(start, i + 1);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    result.push(avg);
  }

  return result;
}

/**
 * Create learning curve data from episode history.
 */
export function createLearningCurve(
  episodes: EpisodeMetrics[],
  evalInterval: number = 50,
  evalSize: number = 20
): LearningCurvePoint[] {
  const points: LearningCurvePoint[] = [];

  for (let i = 0; i < episodes.length; i++) {
    // Record training return for each episode
    const point: LearningCurvePoint = {
      episode: i + 1,
      trainReturn: episodes[i].return_,
    };

    // At evaluation intervals, compute aggregate metrics
    if ((i + 1) % evalInterval === 0 && i >= evalSize - 1) {
      const evalEpisodes = episodes.slice(Math.max(0, i - evalSize + 1), i + 1);
      const metrics = computeMetrics(evalEpisodes);
      point.evalReturn = metrics.avgReturn;
      point.evalSuccessRate = metrics.successRate;
    }

    points.push(point);
  }

  return points;
}

/**
 * Format metrics for display.
 */
export function formatMetrics(metrics: AggregateMetrics): string {
  return [
    `Episodes: ${metrics.numEpisodes}`,
    `Avg Return: ${metrics.avgReturn.toFixed(3)} ± ${metrics.stdReturn.toFixed(3)}`,
    `Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`,
    `Partial Success: ${(metrics.partialSuccessRate * 100).toFixed(1)}%`,
    `Avg Length: ${metrics.avgLength.toFixed(1)} turns`,
    `Hangup Rate: ${(metrics.hangupRate * 100).toFixed(1)}%`,
    `Escalation Rate: ${(metrics.escalationRate * 100).toFixed(1)}%`,
  ].join("\n");
}

/**
 * Compare two sets of metrics.
 */
export function compareMetrics(
  baseline: AggregateMetrics,
  learned: AggregateMetrics
): Record<string, { baseline: number; learned: number; improvement: number }> {
  const compare = (b: number, l: number) => ({
    baseline: b,
    learned: l,
    improvement: b !== 0 ? ((l - b) / Math.abs(b)) * 100 : l > 0 ? 100 : 0,
  });

  return {
    avgReturn: compare(baseline.avgReturn, learned.avgReturn),
    successRate: compare(baseline.successRate, learned.successRate),
    partialSuccessRate: compare(baseline.partialSuccessRate, learned.partialSuccessRate),
    avgLength: compare(baseline.avgLength, learned.avgLength),
    hangupRate: compare(baseline.hangupRate, learned.hangupRate),
  };
}

/**
 * Outcome distribution from episodes.
 */
export function getOutcomeDistribution(
  episodes: EpisodeMetrics[]
): Map<TerminalReason, number> {
  const distribution = new Map<TerminalReason, number>();

  for (const ep of episodes) {
    const count = distribution.get(ep.outcome) || 0;
    distribution.set(ep.outcome, count + 1);
  }

  return distribution;
}
