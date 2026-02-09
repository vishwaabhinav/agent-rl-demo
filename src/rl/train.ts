/**
 * Training Script
 *
 * Main entry point for running RL experiments.
 * Run with: npx tsx src/rl/train.ts [options]
 */

// Load environment variables from .env.local
import { config } from "dotenv";
config({ path: ".env.local" });


import type { CaseData } from "../lib/types";
import type { PersonaConfig, Learner } from "./types";
import { DEFAULT_ENV_CONFIG } from "./types";
import {
  DebtCollectionEnv,
  createTestCase,
  createEnvironment,
} from "./environment/gym-wrapper";
import { OpenAILLMClient } from "./simulator/openai-client";
import { PRESET_PERSONAS, getPresetPersonaNames } from "./simulator/personas";
import { BanditLearner, DEFAULT_BANDIT_CONFIG } from "./learners/bandit";
import { QLearner, DEFAULT_QLEARNING_CONFIG } from "./learners/qlearning";
import { RandomPolicy, FixedScriptPolicy, HeuristicPolicy } from "./learners/baselines";
import {
  trainAndEvaluate,
  runBaseline,
  compareLearners,
  TrainingConfig,
  TrainingResult,
  saveResultsToDb,
} from "./evaluation/runner";
import { computeMetrics, formatMetrics, compareMetrics } from "./evaluation/metrics";
import * as db from "../lib/db";

// ============ Configuration ============

const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  numEpisodes: 500,
  evalInterval: 50,
  evalEpisodes: 20,
  logInterval: 50,
  personas: Object.values(PRESET_PERSONAS),
};

const QUICK_TRAINING_CONFIG: TrainingConfig = {
  numEpisodes: 100,
  evalInterval: 25,
  evalEpisodes: 10,
  logInterval: 25,
  personas: Object.values(PRESET_PERSONAS),
};

// Default epsilon for continued training (some exploration, but less than fresh start)
const CONTINUED_TRAINING_EPSILON = 0.1;

// ============ Continued Training ============

/**
 * Load a learner from a previous experiment.
 * Returns null if experiment not found or has no learner state.
 */
function loadLearnerFromExperiment(experimentId: string): { learner: Learner; type: "bandit" | "qlearning" } | null {
  const experiment = db.getExperiment(experimentId);
  if (!experiment) {
    console.error(`Experiment not found: ${experimentId}`);
    return null;
  }

  if (!experiment.learner_state) {
    console.error(`Experiment has no saved learner state: ${experimentId}`);
    return null;
  }

  if (!experiment.learner_type || experiment.learner_type === "baseline") {
    console.error(`Cannot continue from baseline policy: ${experimentId}`);
    return null;
  }

  const learnerType = experiment.learner_type;
  let learner: Learner;

  if (learnerType === "bandit") {
    learner = new BanditLearner();
    learner.load(experiment.learner_state);
    // Reset epsilon for continued exploration
    (learner as BanditLearner).setConfig({ epsilon: CONTINUED_TRAINING_EPSILON });
  } else {
    learner = new QLearner();
    learner.load(experiment.learner_state);
    // Reset epsilon for continued exploration
    (learner as QLearner).setConfig({ epsilon: CONTINUED_TRAINING_EPSILON });
  }

  const policy = learner.getPolicy();
  console.log(`Loaded ${learnerType} from ${experimentId}`);
  console.log(`  Episodes previously trained: ${policy.episodesTrained}`);
  console.log(`  Epsilon reset to: ${CONTINUED_TRAINING_EPSILON}`);

  return { learner, type: learnerType };
}

/**
 * List available experiments for continuation.
 */
function listAvailableExperiments(): void {
  const experiments = db.listExperiments("training");
  if (experiments.length === 0) {
    console.log("No training experiments found.");
    return;
  }

  console.log("\nAvailable experiments for continuation:\n");
  console.log("ID                                          Type        Episodes    Success Rate");
  console.log("-".repeat(85));

  for (const exp of experiments.slice(0, 20)) {
    const metrics = exp.final_metrics_json ? JSON.parse(exp.final_metrics_json) : null;
    const config = exp.config_json ? JSON.parse(exp.config_json) : null;
    const episodes = config?.numEpisodes || "?";
    const successRate = metrics?.successRate ? `${(metrics.successRate * 100).toFixed(1)}%` : "N/A";

    console.log(
      `${exp.id.padEnd(44)} ${(exp.learner_type || "?").padEnd(12)} ${String(episodes).padEnd(12)} ${successRate}`
    );
  }

  if (experiments.length > 20) {
    console.log(`\n... and ${experiments.length - 20} more`);
  }
}

// ============ Results ============

function saveExperimentResults(
  name: string,
  result: TrainingResult,
  learnerState: string,
  config?: TrainingConfig
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const experimentId = `${name}-${timestamp}`;
  const learnerType = name === "bandit" ? "bandit" : name === "qlearning" ? "qlearning" : "baseline";
  saveResultsToDb(experimentId, learnerType, result, learnerState, config);
  return experimentId;
}

// ============ Experiment Runners ============

/**
 * Run baseline experiments (random and fixed script).
 */
async function runBaselineExperiments(
  env: DebtCollectionEnv,
  numEpisodes: number = 100
): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("BASELINE EXPERIMENTS");
  console.log("=".repeat(60));

  // Random baseline
  console.log("\n--- Random Policy ---");
  const randomPolicy = new RandomPolicy();
  const randomResult = await runBaseline(
    env,
    randomPolicy,
    numEpisodes,
    Object.values(PRESET_PERSONAS)
  );
  console.log(formatMetrics(randomResult.metrics));

  // Fixed script baseline
  console.log("\n--- Fixed Script Policy ---");
  const fixedPolicy = new FixedScriptPolicy();
  const fixedResult = await runBaseline(
    env,
    fixedPolicy,
    numEpisodes,
    Object.values(PRESET_PERSONAS)
  );
  console.log(formatMetrics(fixedResult.metrics));

  // Heuristic baseline
  console.log("\n--- Heuristic Policy ---");
  const heuristicPolicy = new HeuristicPolicy();
  const heuristicResult = await runBaseline(
    env,
    heuristicPolicy,
    numEpisodes,
    Object.values(PRESET_PERSONAS)
  );
  console.log(formatMetrics(heuristicResult.metrics));
}

/**
 * Run bandit training experiment.
 * @param continueFrom - Optional experiment ID to continue training from
 */
async function runBanditExperiment(
  env: DebtCollectionEnv,
  config: TrainingConfig = DEFAULT_TRAINING_CONFIG,
  continueFrom?: string
): Promise<TrainingResult> {
  console.log("\n" + "=".repeat(60));
  console.log(continueFrom ? "BANDIT TRAINING (CONTINUED)" : "BANDIT TRAINING");
  console.log("=".repeat(60));

  let bandit: BanditLearner;
  let previousEpisodes = 0;

  if (continueFrom) {
    const loaded = loadLearnerFromExperiment(continueFrom);
    if (!loaded) {
      throw new Error(`Failed to load experiment: ${continueFrom}`);
    }
    if (loaded.type !== "bandit") {
      throw new Error(`Expected bandit, got ${loaded.type}`);
    }
    bandit = loaded.learner as BanditLearner;
    previousEpisodes = bandit.getPolicy().episodesTrained;
  } else {
    bandit = new BanditLearner({
      ...DEFAULT_BANDIT_CONFIG,
      epsilon: 0.15,
      learningRate: 0.01,
    });
  }

  const result = await trainAndEvaluate(env, bandit, config);

  console.log("\n--- Final Results ---");
  console.log(formatMetrics(result.finalMetrics));
  console.log(`Training time: ${(result.trainTimeMs / 1000).toFixed(1)}s`);
  if (continueFrom) {
    console.log(`Total episodes trained: ${previousEpisodes + config.numEpisodes}`);
  }

  // Save results
  const expId = saveExperimentResults("bandit", result, bandit.save(), config);
  if (continueFrom) {
    console.log(`Continued from: ${continueFrom}`);
  }

  return result;
}

/**
 * Run Q-learning training experiment.
 * @param continueFrom - Optional experiment ID to continue training from
 */
async function runQLearningExperiment(
  env: DebtCollectionEnv,
  config: TrainingConfig = DEFAULT_TRAINING_CONFIG,
  continueFrom?: string,
  alpha: number = 0.1
): Promise<TrainingResult> {
  console.log("\n" + "=".repeat(60));
  console.log(continueFrom ? "Q-LEARNING TRAINING (CONTINUED)" : "Q-LEARNING TRAINING");
  console.log("=".repeat(60));

  let qlearner: QLearner;
  let previousEpisodes = 0;

  if (continueFrom) {
    const loaded = loadLearnerFromExperiment(continueFrom);
    if (!loaded) {
      throw new Error(`Failed to load experiment: ${continueFrom}`);
    }
    if (loaded.type !== "qlearning") {
      throw new Error(`Expected qlearning, got ${loaded.type}`);
    }
    qlearner = loaded.learner as QLearner;
    previousEpisodes = qlearner.getPolicy().episodesTrained;
    console.log(`Q-table size (loaded): ${qlearner.getTableSize().states} states, ${qlearner.getTableSize().pairs} pairs`);
  } else {
    qlearner = new QLearner({
      ...DEFAULT_QLEARNING_CONFIG,
      alpha,
      gamma: 0.95,
      epsilon: 0.15,
    });
    console.log(`Using alpha=${alpha}, gamma=0.95, epsilon=0.15`);
  }

  const result = await trainAndEvaluate(env, qlearner, config);

  console.log("\n--- Final Results ---");
  console.log(formatMetrics(result.finalMetrics));
  console.log(`Training time: ${(result.trainTimeMs / 1000).toFixed(1)}s`);
  console.log(`Q-table size: ${qlearner.getTableSize().states} states, ${qlearner.getTableSize().pairs} pairs`);
  if (continueFrom) {
    console.log(`Total episodes trained: ${previousEpisodes + config.numEpisodes}`);
  }

  // Save results
  const expId = saveExperimentResults("qlearning", result, qlearner.save(), config);
  if (continueFrom) {
    console.log(`Continued from: ${continueFrom}`);
  }

  return result;
}

/**
 * Compare bandit vs Q-learning.
 */
async function runComparisonExperiment(
  env: DebtCollectionEnv,
  config: TrainingConfig = DEFAULT_TRAINING_CONFIG
): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("BANDIT vs Q-LEARNING COMPARISON");
  console.log("=".repeat(60));

  const learners = new Map<string, Learner>([
    ["Bandit", new BanditLearner({ ...DEFAULT_BANDIT_CONFIG, epsilon: 0.15 })],
    ["Q-Learning", new QLearner({ ...DEFAULT_QLEARNING_CONFIG, epsilon: 0.15 })],
  ]);

  const results = await compareLearners(env, learners, config);

  // Print comparison
  console.log("\n" + "=".repeat(60));
  console.log("COMPARISON SUMMARY");
  console.log("=".repeat(60));

  for (const [name, result] of Array.from(results.entries())) {
    console.log(`\n${name}:`);
    console.log(`  Avg Return: ${result.finalMetrics.avgReturn.toFixed(3)}`);
    console.log(`  Success Rate: ${(result.finalMetrics.successRate * 100).toFixed(1)}%`);
    console.log(`  Partial Success: ${(result.finalMetrics.partialSuccessRate * 100).toFixed(1)}%`);
    console.log(`  Hangup Rate: ${(result.finalMetrics.hangupRate * 100).toFixed(1)}%`);
  }

  // Compare with baseline
  console.log("\n--- Comparison with Random Baseline ---");
  const randomPolicy = new RandomPolicy();
  const baselineResult = await runBaseline(env, randomPolicy, config.evalEpisodes * 2);

  for (const [name, result] of Array.from(results.entries())) {
    const comparison = compareMetrics(baselineResult.metrics, result.finalMetrics);
    console.log(`\n${name} vs Random:`);
    console.log(`  Return improvement: ${comparison.avgReturn.improvement.toFixed(1)}%`);
    console.log(`  Success improvement: ${comparison.successRate.improvement.toFixed(1)}%`);
  }
}

/**
 * Run all experiments.
 */
async function runAllExperiments(quick: boolean = false): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("RL FOR BOUNDED AGENTS - FULL EXPERIMENT SUITE");
  console.log("=".repeat(60));

  // Create environment with appropriate LLM clients
  const caseData = createTestCase();
  const borrowerLLM = new OpenAILLMClient({ model: "gpt-4o-mini", temperature: 0.8 });
  const agentLLM = new OpenAILLMClient({ model: "gpt-4o-mini", temperature: 0.7 });

  console.log(`Using OpenAI LLM for borrower and agent`);
  const env = createEnvironment(borrowerLLM, caseData, undefined, agentLLM);

  const config = quick ? QUICK_TRAINING_CONFIG : DEFAULT_TRAINING_CONFIG;

  console.log(`\nConfiguration:`);
  console.log(`  Episodes: ${config.numEpisodes}`);
  console.log(`  Eval interval: ${config.evalInterval}`);
  console.log(`  Eval episodes: ${config.evalEpisodes}`);
  console.log(`  Personas: ${config.personas?.length || 0}`);

  // Run baselines
  await runBaselineExperiments(env, quick ? 50 : 100);

  // Run bandit
  await runBanditExperiment(env, config);

  // Run Q-learning
  await runQLearningExperiment(env, config);

  // Run comparison
  await runComparisonExperiment(env, config);

  console.log("\n" + "=".repeat(60));
  console.log("ALL EXPERIMENTS COMPLETE");
  console.log("=".repeat(60));
}

// ============ CLI Interface ============

function printUsage(): void {
  console.log(`
RL Training Script for Bounded Agents

Usage: npx tsx src/rl/train.ts [command] [options]

Commands:
  all           Run all experiments (default)
  baseline      Run baseline experiments only
  bandit        Train bandit learner
  qlearning     Train Q-learning
  compare       Compare bandit vs Q-learning
  list          List available experiments for continuation

Options:
  --quick          Use reduced episode count for faster iteration
  --episodes N     Override number of training episodes
  --eval-episodes N  Override number of evaluation episodes (default: 20, final eval runs 2x)
  --no-eval        Skip final evaluation entirely (just train and save)
  --alpha N        Learning rate for Q-learning (default: 0.1)
  --continue ID    Continue training from a previous experiment
  --help           Show this help message

Examples:
  npx tsx src/rl/train.ts bandit --quick                      # Fast training
  npx tsx src/rl/train.ts bandit --episodes 200               # Train for 200 episodes
  npx tsx src/rl/train.ts qlearning --alpha 0.5 --episodes 5  # Q-learning with higher learning rate
  npx tsx src/rl/train.ts list                                # List previous experiments
  npx tsx src/rl/train.ts bandit --continue <experiment-id>   # Continue from previous
  npx tsx src/rl/train.ts qlearning --continue <id> --episodes 500  # Continue with 500 more episodes

Continued Training:
  Training can be resumed from any previous experiment. The learner state (Q-table
  or action weights) is loaded, epsilon is reset to ${CONTINUED_TRAINING_EPSILON} to allow some exploration,
  and training continues. Each continuation creates a new experiment entry.

  100 episodes → save → 100 more episodes = 200 total episodes of learning
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse options
  const quick = args.includes("--quick");
  const helpRequested = args.includes("--help") || args.includes("-h");

  if (helpRequested) {
    printUsage();
    return;
  }

  // Parse episodes override
  let episodesOverride: number | undefined;
  const episodesIdx = args.indexOf("--episodes");
  if (episodesIdx !== -1 && args[episodesIdx + 1]) {
    episodesOverride = parseInt(args[episodesIdx + 1], 10);
  }

  // Parse eval episodes override
  let evalEpisodesOverride: number | undefined;
  const evalEpisodesIdx = args.indexOf("--eval-episodes");
  if (evalEpisodesIdx !== -1 && args[evalEpisodesIdx + 1]) {
    evalEpisodesOverride = parseInt(args[evalEpisodesIdx + 1], 10);
  }

  // Parse no-eval flag
  const skipEval = args.includes("--no-eval");

  // Parse alpha (learning rate) override
  let alphaOverride: number | undefined;
  const alphaIdx = args.indexOf("--alpha");
  if (alphaIdx !== -1 && args[alphaIdx + 1]) {
    alphaOverride = parseFloat(args[alphaIdx + 1]);
  }

  // Parse continue from
  let continueFrom: string | undefined;
  const continueIdx = args.indexOf("--continue");
  if (continueIdx !== -1 && args[continueIdx + 1]) {
    continueFrom = args[continueIdx + 1];
  }

  // Get command (first arg that doesn't start with --)
  const command = args.find((a) =>
    !a.startsWith("--") &&
    a !== continueFrom &&
    a !== String(episodesOverride) &&
    a !== String(evalEpisodesOverride) &&
    a !== String(alphaOverride)
  ) || "all";

  // Handle list command (doesn't need environment)
  if (command === "list") {
    listAvailableExperiments();
    return;
  }

  // Create environment with appropriate LLM clients
  const caseData = createTestCase();
  const borrowerLLM = new OpenAILLMClient({ model: "gpt-4o-mini", temperature: 0.8 });
  const agentLLM = new OpenAILLMClient({ model: "gpt-4o-mini", temperature: 0.7 });

  console.log(`Using OpenAI LLM for borrower and agent`);
  const env = createEnvironment(borrowerLLM, caseData, undefined, agentLLM);

  // Build config
  const baseConfig = quick ? QUICK_TRAINING_CONFIG : DEFAULT_TRAINING_CONFIG;
  const config: TrainingConfig = {
    ...baseConfig,
    ...(episodesOverride && { numEpisodes: episodesOverride }),
    ...(evalEpisodesOverride !== undefined && { evalEpisodes: evalEpisodesOverride }),
    ...(skipEval && { evalEpisodes: 0 }),
  };

  // Run requested command
  switch (command) {
    case "all":
      if (continueFrom) {
        console.error("Cannot use --continue with 'all' command. Use bandit or qlearning.");
        process.exit(1);
      }
      await runAllExperiments(quick);
      break;

    case "baseline":
      if (continueFrom) {
        console.error("Cannot continue from baseline policies.");
        process.exit(1);
      }
      await runBaselineExperiments(env, quick ? 50 : 100);
      break;

    case "bandit":
      await runBanditExperiment(env, config, continueFrom);
      break;

    case "qlearning":
      await runQLearningExperiment(env, config, continueFrom, alphaOverride ?? 0.1);
      break;

    case "compare":
      if (continueFrom) {
        console.error("Cannot use --continue with 'compare' command.");
        process.exit(1);
      }
      await runComparisonExperiment(env, config);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

// Run if executed directly
main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
