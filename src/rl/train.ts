/**
 * Training Script
 *
 * Main entry point for running RL experiments.
 * Run with: npx tsx src/rl/train.ts [options]
 */

// Load environment variables from .env.local
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

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
  saveResults,
  saveResultsToDb,
} from "./evaluation/runner";
import { computeMetrics, formatMetrics, compareMetrics } from "./evaluation/metrics";

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

// ============ Results Directory ============

const RESULTS_DIR = join(process.cwd(), "rl-results");

function ensureResultsDir(): void {
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }
}

function saveExperimentResults(
  name: string,
  result: TrainingResult,
  learnerState: string,
  config?: TrainingConfig
): string {
  ensureResultsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const experimentId = `${name}-${timestamp}`;
  const filename = `${experimentId}.json`;
  const filepath = join(RESULTS_DIR, filename);

  // Save to JSON file (for backwards compatibility)
  const data = saveResults(result, learnerState);
  writeFileSync(filepath, data);

  // Save to SQLite database (with full episode transcripts)
  const learnerType = name === "bandit" ? "bandit" : name === "qlearning" ? "qlearning" : "baseline";
  saveResultsToDb(experimentId, learnerType, result, learnerState, config);

  console.log(`Results saved to: ${filepath}`);
  return filepath;
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
 */
async function runBanditExperiment(
  env: DebtCollectionEnv,
  config: TrainingConfig = DEFAULT_TRAINING_CONFIG
): Promise<TrainingResult> {
  console.log("\n" + "=".repeat(60));
  console.log("BANDIT TRAINING");
  console.log("=".repeat(60));

  const bandit = new BanditLearner({
    ...DEFAULT_BANDIT_CONFIG,
    epsilon: 0.15, // Slightly more exploration
    learningRate: 0.01,
  });

  const result = await trainAndEvaluate(env, bandit, config);

  console.log("\n--- Final Results ---");
  console.log(formatMetrics(result.finalMetrics));
  console.log(`Training time: ${(result.trainTimeMs / 1000).toFixed(1)}s`);

  // Save results
  saveExperimentResults("bandit", result, bandit.save(), config);

  return result;
}

/**
 * Run Q-learning training experiment.
 */
async function runQLearningExperiment(
  env: DebtCollectionEnv,
  config: TrainingConfig = DEFAULT_TRAINING_CONFIG
): Promise<TrainingResult> {
  console.log("\n" + "=".repeat(60));
  console.log("Q-LEARNING TRAINING");
  console.log("=".repeat(60));

  const qlearner = new QLearner({
    ...DEFAULT_QLEARNING_CONFIG,
    alpha: 0.1,
    gamma: 0.95,
    epsilon: 0.15,
  });

  const result = await trainAndEvaluate(env, qlearner, config);

  console.log("\n--- Final Results ---");
  console.log(formatMetrics(result.finalMetrics));
  console.log(`Training time: ${(result.trainTimeMs / 1000).toFixed(1)}s`);
  console.log(`Q-table size: ${qlearner.getTableSize().states} states, ${qlearner.getTableSize().pairs} pairs`);

  // Save results
  saveExperimentResults("qlearning", result, qlearner.save(), config);

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

Options:
  --quick       Use reduced episode count for faster iteration
  --episodes N  Override number of training episodes
  --help        Show this help message

Examples:
  npx tsx src/rl/train.ts bandit --quick              # Fast with real LLM
  npx tsx src/rl/train.ts bandit --episodes 200       # Real LLM with 200 episodes
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

  // Get command
  const command = args.find((a) => !a.startsWith("--")) || "all";

  // Create environment with appropriate LLM clients
  const caseData = createTestCase();
  const borrowerLLM = new OpenAILLMClient({ model: "gpt-4o-mini", temperature: 0.8 });
  const agentLLM = new OpenAILLMClient({ model: "gpt-4o-mini", temperature: 0.7 });

  console.log(`Using OpenAI LLM for borrower and agent`);
  const env = createEnvironment(borrowerLLM, caseData, undefined, agentLLM);

  // Build config
  const baseConfig = quick ? QUICK_TRAINING_CONFIG : DEFAULT_TRAINING_CONFIG;
  const config: TrainingConfig = episodesOverride
    ? { ...baseConfig, numEpisodes: episodesOverride }
    : baseConfig;

  // Run requested command
  switch (command) {
    case "all":
      await runAllExperiments(quick);
      break;

    case "baseline":
      await runBaselineExperiments(env, quick ? 50 : 100);
      break;

    case "bandit":
      await runBanditExperiment(env, config);
      break;

    case "qlearning":
      await runQLearningExperiment(env, config);
      break;

    case "compare":
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
