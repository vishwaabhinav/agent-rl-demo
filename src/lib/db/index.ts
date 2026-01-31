/**
 * SQLite database for storing training and simulation data
 */

import Database from "better-sqlite3";
import { join } from "path";

const DB_PATH = join(process.cwd(), "agent.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- Experiments: training runs and voice simulations
    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('training', 'voice-simulation')),
      learner_type TEXT CHECK (learner_type IN ('bandit', 'qlearning', 'baseline')),
      config_json TEXT,
      final_metrics_json TEXT,
      learner_state TEXT,
      train_time_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Episodes: individual conversations
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      episode_num INTEGER NOT NULL,
      persona_id TEXT,
      persona_name TEXT,
      persona_json TEXT,
      outcome TEXT,
      total_return REAL,
      turns INTEGER,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Turns: each exchange in a conversation
    CREATE TABLE IF NOT EXISTS turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      turn_num INTEGER NOT NULL,
      fsm_state TEXT,
      action TEXT,
      agent_text TEXT,
      borrower_text TEXT,
      reward REAL,
      reward_breakdown_json TEXT,
      state_json TEXT,
      next_state_json TEXT,
      detected_signals_json TEXT
    );

    -- Learning curve points
    CREATE TABLE IF NOT EXISTS learning_curve (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
      episode_num INTEGER NOT NULL,
      train_return REAL,
      eval_return REAL,
      eval_success_rate REAL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_episodes_experiment ON episodes(experiment_id);
    CREATE INDEX IF NOT EXISTS idx_turns_episode ON turns(episode_id);
    CREATE INDEX IF NOT EXISTS idx_learning_curve_experiment ON learning_curve(experiment_id);
    CREATE INDEX IF NOT EXISTS idx_episodes_outcome ON episodes(outcome);
    CREATE INDEX IF NOT EXISTS idx_episodes_persona ON episodes(persona_id);
  `);
}

// ============ Experiment Operations ============

export interface ExperimentRow {
  id: string;
  type: "training" | "voice-simulation";
  learner_type: "bandit" | "qlearning" | "baseline" | null;
  config_json: string | null;
  final_metrics_json: string | null;
  learner_state: string | null;
  train_time_ms: number | null;
  created_at: string;
}

export function createExperiment(data: {
  id: string;
  type: "training" | "voice-simulation";
  learnerType?: "bandit" | "qlearning" | "baseline";
  config?: object;
  finalMetrics?: object;
  learnerState?: string;
  trainTimeMs?: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO experiments (id, type, learner_type, config_json, final_metrics_json, learner_state, train_time_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.type,
    data.learnerType || null,
    data.config ? JSON.stringify(data.config) : null,
    data.finalMetrics ? JSON.stringify(data.finalMetrics) : null,
    data.learnerState || null,
    data.trainTimeMs || null
  );
}

export function updateExperiment(id: string, data: {
  finalMetrics?: object;
  learnerState?: string;
  trainTimeMs?: number;
}): void {
  const db = getDb();
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.finalMetrics !== undefined) {
    updates.push("final_metrics_json = ?");
    values.push(JSON.stringify(data.finalMetrics));
  }
  if (data.learnerState !== undefined) {
    updates.push("learner_state = ?");
    values.push(data.learnerState);
  }
  if (data.trainTimeMs !== undefined) {
    updates.push("train_time_ms = ?");
    values.push(data.trainTimeMs);
  }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE experiments SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
}

export function listExperiments(type?: "training" | "voice-simulation"): ExperimentRow[] {
  const db = getDb();
  if (type) {
    return db.prepare("SELECT * FROM experiments WHERE type = ? ORDER BY created_at DESC").all(type) as ExperimentRow[];
  }
  return db.prepare("SELECT * FROM experiments ORDER BY created_at DESC").all() as ExperimentRow[];
}

export function getExperiment(id: string): ExperimentRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM experiments WHERE id = ?").get(id) as ExperimentRow | undefined;
}

// ============ Episode Operations ============

export interface EpisodeRow {
  id: string;
  experiment_id: string;
  episode_num: number;
  persona_id: string | null;
  persona_name: string | null;
  persona_json: string | null;
  outcome: string | null;
  total_return: number | null;
  turns: number | null;
  duration_ms: number | null;
  created_at: string;
}

export function createEpisode(data: {
  id: string;
  experimentId: string;
  episodeNum: number;
  personaId?: string;
  personaName?: string;
  persona?: object;
  outcome?: string;
  totalReturn?: number;
  turns?: number;
  durationMs?: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO episodes (id, experiment_id, episode_num, persona_id, persona_name, persona_json, outcome, total_return, turns, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.experimentId,
    data.episodeNum,
    data.personaId || null,
    data.personaName || null,
    data.persona ? JSON.stringify(data.persona) : null,
    data.outcome || null,
    data.totalReturn ?? null,
    data.turns ?? null,
    data.durationMs ?? null
  );
}

export function listEpisodes(experimentId: string): EpisodeRow[] {
  const db = getDb();
  return db.prepare("SELECT * FROM episodes WHERE experiment_id = ? ORDER BY episode_num").all(experimentId) as EpisodeRow[];
}

export function getEpisode(id: string): EpisodeRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM episodes WHERE id = ?").get(id) as EpisodeRow | undefined;
}

export function queryEpisodes(filters: {
  experimentId?: string;
  outcome?: string;
  personaId?: string;
  minReturn?: number;
  maxReturn?: number;
  limit?: number;
  offset?: number;
}): EpisodeRow[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (filters.experimentId) {
    conditions.push("experiment_id = ?");
    values.push(filters.experimentId);
  }
  if (filters.outcome) {
    conditions.push("outcome = ?");
    values.push(filters.outcome);
  }
  if (filters.personaId) {
    conditions.push("persona_id = ?");
    values.push(filters.personaId);
  }
  if (filters.minReturn !== undefined) {
    conditions.push("total_return >= ?");
    values.push(filters.minReturn);
  }
  if (filters.maxReturn !== undefined) {
    conditions.push("total_return <= ?");
    values.push(filters.maxReturn);
  }

  let sql = "SELECT * FROM episodes";
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY created_at DESC";

  if (filters.limit) {
    sql += " LIMIT ?";
    values.push(filters.limit);
  }
  if (filters.offset) {
    sql += " OFFSET ?";
    values.push(filters.offset);
  }

  return db.prepare(sql).all(...values) as EpisodeRow[];
}

// ============ Turn Operations ============

export interface TurnRow {
  id: number;
  episode_id: string;
  turn_num: number;
  fsm_state: string | null;
  action: string | null;
  agent_text: string | null;
  borrower_text: string | null;
  reward: number | null;
  reward_breakdown_json: string | null;
  state_json: string | null;
  next_state_json: string | null;
  detected_signals_json: string | null;
}

export function createTurn(data: {
  episodeId: string;
  turnNum: number;
  fsmState?: string;
  action?: string;
  agentText?: string;
  borrowerText?: string;
  reward?: number;
  rewardBreakdown?: object;
  state?: object;
  nextState?: object;
  detectedSignals?: string[];
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO turns (episode_id, turn_num, fsm_state, action, agent_text, borrower_text, reward, reward_breakdown_json, state_json, next_state_json, detected_signals_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.episodeId,
    data.turnNum,
    data.fsmState || null,
    data.action || null,
    data.agentText || null,
    data.borrowerText || null,
    data.reward ?? null,
    data.rewardBreakdown ? JSON.stringify(data.rewardBreakdown) : null,
    data.state ? JSON.stringify(data.state) : null,
    data.nextState ? JSON.stringify(data.nextState) : null,
    data.detectedSignals ? JSON.stringify(data.detectedSignals) : null
  );
}

export function createTurnsBatch(turns: Parameters<typeof createTurn>[0][]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO turns (episode_id, turn_num, fsm_state, action, agent_text, borrower_text, reward, reward_breakdown_json, state_json, next_state_json, detected_signals_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: Parameters<typeof createTurn>[0][]) => {
    for (const data of items) {
      stmt.run(
        data.episodeId,
        data.turnNum,
        data.fsmState || null,
        data.action || null,
        data.agentText || null,
        data.borrowerText || null,
        data.reward ?? null,
        data.rewardBreakdown ? JSON.stringify(data.rewardBreakdown) : null,
        data.state ? JSON.stringify(data.state) : null,
        data.nextState ? JSON.stringify(data.nextState) : null,
        data.detectedSignals ? JSON.stringify(data.detectedSignals) : null
      );
    }
  });

  insertMany(turns);
}

export function listTurns(episodeId: string): TurnRow[] {
  const db = getDb();
  return db.prepare("SELECT * FROM turns WHERE episode_id = ? ORDER BY turn_num").all(episodeId) as TurnRow[];
}

// ============ Learning Curve Operations ============

export interface LearningCurveRow {
  id: number;
  experiment_id: string;
  episode_num: number;
  train_return: number | null;
  eval_return: number | null;
  eval_success_rate: number | null;
}

export function addLearningCurvePoint(data: {
  experimentId: string;
  episodeNum: number;
  trainReturn?: number;
  evalReturn?: number;
  evalSuccessRate?: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO learning_curve (experiment_id, episode_num, train_return, eval_return, eval_success_rate)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    data.experimentId,
    data.episodeNum,
    data.trainReturn ?? null,
    data.evalReturn ?? null,
    data.evalSuccessRate ?? null
  );
}

export function getLearningCurve(experimentId: string): LearningCurveRow[] {
  const db = getDb();
  return db.prepare("SELECT * FROM learning_curve WHERE experiment_id = ? ORDER BY episode_num").all(experimentId) as LearningCurveRow[];
}

// ============ Aggregation Queries ============

export function getExperimentStats(experimentId: string): {
  totalEpisodes: number;
  avgReturn: number;
  successRate: number;
  outcomeDistribution: Record<string, number>;
} {
  const db = getDb();

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_episodes,
      AVG(total_return) as avg_return,
      SUM(CASE WHEN outcome LIKE '%PAYMENT%' OR outcome LIKE '%SUCCESS%' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate
    FROM episodes
    WHERE experiment_id = ?
  `).get(experimentId) as { total_episodes: number; avg_return: number; success_rate: number };

  const outcomes = db.prepare(`
    SELECT outcome, COUNT(*) as count
    FROM episodes
    WHERE experiment_id = ?
    GROUP BY outcome
  `).all(experimentId) as { outcome: string; count: number }[];

  const outcomeDistribution: Record<string, number> = {};
  for (const row of outcomes) {
    if (row.outcome) {
      outcomeDistribution[row.outcome] = row.count;
    }
  }

  return {
    totalEpisodes: stats.total_episodes,
    avgReturn: stats.avg_return || 0,
    successRate: stats.success_rate || 0,
    outcomeDistribution,
  };
}

// ============ Cleanup ============

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
