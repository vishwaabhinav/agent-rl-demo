/**
 * Episode Runner
 *
 * Runs episodes, collects trajectories, and manages training loops.
 */

import type {
  RLState,
  RLAction,
  EpisodeMetrics,
  AggregateMetrics,
  Trajectory,
  PersonaConfig,
  Learner,
  LearningCurvePoint,
} from "../types";
import { DebtCollectionEnv } from "../environment/gym-wrapper";
import { computeMetrics, createLearningCurve } from "./metrics";
import * as db from "../../lib/db";

/**
 * Run a single episode.
 */
export async function runEpisode(
  env: DebtCollectionEnv,
  learner: Learner,
  train: boolean = true,
  persona?: PersonaConfig
): Promise<EpisodeMetrics> {
  // Reset environment
  console.log(`  [Episode] Starting episode with persona: ${persona?.name || 'default'}`);
  let state = env.reset(persona);
  let totalReturn = 0;
  let steps = 0;

  // Run episode
  while (!env.isDone()) {
    const allowedActions = env.getAllowedActions();
    const action = learner.selectAction(state, allowedActions);
    console.log(`    [Step ${steps + 1}] FSM: ${env.getFSMState()} | Action: ${action}`);

    const result = await env.step(action);
    console.log(`    [Step ${steps + 1}] Reward: ${result.reward.toFixed(2)} | Done: ${result.done}`);

    // Update learner if training
    if (train) {
      learner.update(
        state,
        action,
        result.reward,
        result.done ? null : result.state,
        result.done
      );
    }

    totalReturn += result.reward;
    state = result.state;
    steps++;
  }
  console.log(`  [Episode] Completed: ${steps} steps, return: ${totalReturn.toFixed(2)}`);

  // Get trajectory
  const trajectory = env.getTrajectory();

  return {
    episodeId: Date.now(),
    return_: totalReturn,
    length: steps,
    outcome: trajectory.outcome,
    persona: env.getPersona(),
    trajectory,
    timestamp: new Date(),
  };
}

/**
 * Run multiple episodes for evaluation (no training).
 */
export async function runEvaluation(
  env: DebtCollectionEnv,
  learner: Learner,
  numEpisodes: number,
  personas?: PersonaConfig[]
): Promise<{ episodes: EpisodeMetrics[]; metrics: AggregateMetrics }> {
  const episodes: EpisodeMetrics[] = [];

  for (let i = 0; i < numEpisodes; i++) {
    const persona = personas ? personas[i % personas.length] : undefined;
    const ep = await runEpisode(env, learner, false, persona);
    episodes.push(ep);
  }

  const metrics = computeMetrics(episodes);
  return { episodes, metrics };
}

/**
 * Training configuration.
 */
export interface TrainingConfig {
  numEpisodes: number;
  evalInterval: number;
  evalEpisodes: number;
  logInterval: number;
  saveInterval?: number;
  personas?: PersonaConfig[];
}

/**
 * Training result.
 */
export interface TrainingResult {
  trainEpisodes: EpisodeMetrics[];
  evalResults: Array<{ episode: number; metrics: AggregateMetrics }>;
  learningCurve: LearningCurvePoint[];
  finalMetrics: AggregateMetrics;
  trainTimeMs: number;
}

/**
 * Callback for training progress.
 */
export type TrainingCallback = (
  episode: number,
  metrics: EpisodeMetrics,
  evalMetrics?: AggregateMetrics
) => void;

/**
 * Train a learner and evaluate periodically.
 */
export async function trainAndEvaluate(
  env: DebtCollectionEnv,
  learner: Learner,
  config: TrainingConfig,
  callback?: TrainingCallback
): Promise<TrainingResult> {
  const startTime = Date.now();
  const trainEpisodes: EpisodeMetrics[] = [];
  const evalResults: Array<{ episode: number; metrics: AggregateMetrics }> = [];

  console.log(`Starting training: ${config.numEpisodes} episodes`);
  for (let ep = 1; ep <= config.numEpisodes; ep++) {
    console.log(`\n[Training] Episode ${ep}/${config.numEpisodes}`);
    // Sample persona for this episode
    const persona = config.personas
      ? config.personas[Math.floor(Math.random() * config.personas.length)]
      : undefined;

    // Run training episode
    const episode = await runEpisode(env, learner, true, persona);
    trainEpisodes.push(episode);
    console.log(`[Training] Episode ${ep} done: return=${episode.return_.toFixed(2)}, outcome=${episode.outcome}`);

    // Log progress
    if (ep % config.logInterval === 0) {
      const recentEps = trainEpisodes.slice(-config.logInterval);
      const recentMetrics = computeMetrics(recentEps);
      console.log(
        `Episode ${ep}/${config.numEpisodes} | ` +
        `Avg Return: ${recentMetrics.avgReturn.toFixed(3)} | ` +
        `Success: ${(recentMetrics.successRate * 100).toFixed(1)}%`
      );
    }

    // Evaluate periodically
    let evalMetrics: AggregateMetrics | undefined;
    if (ep % config.evalInterval === 0) {
      const evalResult = await runEvaluation(
        env,
        learner,
        config.evalEpisodes,
        config.personas
      );
      evalResults.push({ episode: ep, metrics: evalResult.metrics });
      evalMetrics = evalResult.metrics;

      console.log(
        `  Eval @ ${ep}: Return ${evalMetrics.avgReturn.toFixed(3)} | ` +
        `Success ${(evalMetrics.successRate * 100).toFixed(1)}%`
      );
    }

    // Callback
    if (callback) {
      callback(ep, episode, evalMetrics);
    }
  }

  // Final evaluation (skip if evalEpisodes is 0)
  let finalMetrics: AggregateMetrics;
  if (config.evalEpisodes > 0) {
    const evalResult = await runEvaluation(
      env,
      learner,
      config.evalEpisodes * 2,
      config.personas
    );
    finalMetrics = evalResult.metrics;
  } else {
    // Use training episode metrics as final metrics
    finalMetrics = computeMetrics(trainEpisodes);
    console.log("Skipping final evaluation (--no-eval or evalEpisodes=0)");
  }

  // Create learning curve
  const learningCurve = createLearningCurve(
    trainEpisodes,
    config.evalInterval,
    config.evalEpisodes
  );

  return {
    trainEpisodes,
    evalResults,
    learningCurve,
    finalMetrics,
    trainTimeMs: Date.now() - startTime,
  };
}

/**
 * Compare multiple learners on the same environment.
 */
export async function compareLearners(
  env: DebtCollectionEnv,
  learners: Map<string, Learner>,
  config: TrainingConfig
): Promise<Map<string, TrainingResult>> {
  const results = new Map<string, TrainingResult>();

  for (const [name, learner] of Array.from(learners.entries())) {
    console.log(`\n=== Training ${name} ===`);
    learner.reset();
    const result = await trainAndEvaluate(env, learner, config);
    results.set(name, result);
  }

  return results;
}

/**
 * Run baseline evaluation (no training).
 */
export async function runBaseline(
  env: DebtCollectionEnv,
  learner: Learner,
  numEpisodes: number,
  personas?: PersonaConfig[]
): Promise<{ episodes: EpisodeMetrics[]; metrics: AggregateMetrics }> {
  console.log(`Running baseline (${numEpisodes} episodes)...`);
  const result = await runEvaluation(env, learner, numEpisodes, personas);
  console.log(
    `Baseline: Return ${result.metrics.avgReturn.toFixed(3)} | ` +
    `Success ${(result.metrics.successRate * 100).toFixed(1)}%`
  );
  return result;
}

/**
 * Batch runner for running multiple experiments.
 */
export interface ExperimentConfig {
  name: string;
  learner: Learner;
  trainingConfig: TrainingConfig;
}

/**
 * Run multiple experiments and collect results.
 */
export async function runExperiments(
  env: DebtCollectionEnv,
  experiments: ExperimentConfig[]
): Promise<Map<string, TrainingResult>> {
  const results = new Map<string, TrainingResult>();

  for (const exp of experiments) {
    console.log(`\n=== Experiment: ${exp.name} ===`);
    exp.learner.reset();
    const result = await trainAndEvaluate(env, exp.learner, exp.trainingConfig);
    results.set(exp.name, result);
  }

  return results;
}

/**
 * Save training results to SQLite database.
 */
export function saveResultsToDb(
  experimentId: string,
  learnerType: "bandit" | "qlearning" | "baseline",
  results: TrainingResult,
  learnerState: string,
  config?: TrainingConfig
): void {
  // Create experiment
  db.createExperiment({
    id: experimentId,
    type: "training",
    learnerType,
    config: config,
    finalMetrics: results.finalMetrics,
    learnerState,
    trainTimeMs: results.trainTimeMs,
  });

  // Save learning curve
  for (const point of results.learningCurve) {
    db.addLearningCurvePoint({
      experimentId,
      episodeNum: point.episode,
      trainReturn: point.trainReturn,
      evalReturn: point.evalReturn,
      evalSuccessRate: point.evalSuccessRate,
    });
  }

  // Save episodes with transcripts
  for (let i = 0; i < results.trainEpisodes.length; i++) {
    const ep = results.trainEpisodes[i];
    const episodeId = `${experimentId}-ep-${i + 1}`;

    db.createEpisode({
      id: episodeId,
      experimentId,
      episodeNum: i + 1,
      personaId: ep.persona?.name?.toLowerCase().replace(/\s+/g, "-"),
      personaName: ep.persona?.name,
      persona: ep.persona,
      outcome: ep.outcome,
      totalReturn: ep.return_,
      turns: ep.length,
    });

    // Save turns/transitions
    if (ep.trajectory?.transitions) {
      const turns = ep.trajectory.transitions.map((t, turnIdx) => ({
        episodeId,
        turnNum: turnIdx + 1,
        fsmState: t.state.fsmState,
        action: t.action,
        agentText: t.info?.agentUtterance,
        borrowerText: t.info?.borrowerResponse,
        reward: t.reward,
        rewardBreakdown: t.info?.rewardBreakdown,
        state: t.state,
        nextState: t.nextState,
        detectedSignals: t.info?.detectedSignals,
      }));
      db.createTurnsBatch(turns);
    }
  }

  console.log(`Saved ${results.trainEpisodes.length} episodes to database (experiment: ${experimentId})`);
}

/**
 * Simple progress bar for console output.
 */
export function progressBar(current: number, total: number, width: number = 30): string {
  const percent = current / total;
  const filled = Math.round(width * percent);
  const empty = width - filled;
  return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${(percent * 100).toFixed(1)}%`;
}
