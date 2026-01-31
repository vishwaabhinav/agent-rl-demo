/**
 * API for experiments and episodes from SQLite database
 */

import { NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    switch (action) {
      // List all experiments
      case "list":
      case null: {
        const type = searchParams.get("type") as "training" | "voice-simulation" | undefined;
        const experiments = db.listExperiments(type || undefined);

        // Enrich with stats
        const enriched = experiments.map((exp) => {
          const stats = db.getExperimentStats(exp.id);
          return {
            id: exp.id,
            type: exp.type,
            learnerType: exp.learner_type,
            createdAt: exp.created_at,
            trainTimeMs: exp.train_time_ms,
            totalEpisodes: stats.totalEpisodes,
            avgReturn: stats.avgReturn,
            successRate: stats.successRate,
            finalMetrics: exp.final_metrics_json ? JSON.parse(exp.final_metrics_json) : null,
          };
        });

        return NextResponse.json({ experiments: enriched });
      }

      // Get single experiment with full details
      case "get": {
        const id = searchParams.get("id");
        if (!id) {
          return NextResponse.json({ error: "Experiment ID required" }, { status: 400 });
        }

        const exp = db.getExperiment(id);
        if (!exp) {
          return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
        }

        const episodes = db.listEpisodes(id);
        const learningCurve = db.getLearningCurve(id);
        const stats = db.getExperimentStats(id);

        return NextResponse.json({
          id: exp.id,
          type: exp.type,
          learnerType: exp.learner_type,
          createdAt: exp.created_at,
          trainTimeMs: exp.train_time_ms,
          config: exp.config_json ? JSON.parse(exp.config_json) : null,
          finalMetrics: exp.final_metrics_json ? JSON.parse(exp.final_metrics_json) : null,
          learnerState: exp.learner_state,
          stats,
          learningCurve: learningCurve.map((p) => ({
            episode: p.episode_num,
            trainReturn: p.train_return,
            evalReturn: p.eval_return,
            evalSuccessRate: p.eval_success_rate,
          })),
          episodes: episodes.map((ep) => ({
            id: ep.id,
            episodeNum: ep.episode_num,
            personaId: ep.persona_id,
            personaName: ep.persona_name,
            persona: ep.persona_json ? JSON.parse(ep.persona_json) : null,
            outcome: ep.outcome,
            totalReturn: ep.total_return,
            turns: ep.turns,
            durationMs: ep.duration_ms,
            createdAt: ep.created_at,
          })),
        });
      }

      // Get episode with full transcript
      case "episode": {
        const id = searchParams.get("id");
        if (!id) {
          return NextResponse.json({ error: "Episode ID required" }, { status: 400 });
        }

        const episode = db.getEpisode(id);
        if (!episode) {
          return NextResponse.json({ error: "Episode not found" }, { status: 404 });
        }

        const turns = db.listTurns(id);

        return NextResponse.json({
          id: episode.id,
          experimentId: episode.experiment_id,
          episodeNum: episode.episode_num,
          personaId: episode.persona_id,
          personaName: episode.persona_name,
          persona: episode.persona_json ? JSON.parse(episode.persona_json) : null,
          outcome: episode.outcome,
          totalReturn: episode.total_return,
          turns: episode.turns,
          durationMs: episode.duration_ms,
          createdAt: episode.created_at,
          transcript: turns.map((t) => ({
            turnNum: t.turn_num,
            fsmState: t.fsm_state,
            action: t.action,
            agentText: t.agent_text,
            borrowerText: t.borrower_text,
            reward: t.reward,
            rewardBreakdown: t.reward_breakdown_json ? JSON.parse(t.reward_breakdown_json) : null,
            state: t.state_json ? JSON.parse(t.state_json) : null,
            nextState: t.next_state_json ? JSON.parse(t.next_state_json) : null,
            detectedSignals: t.detected_signals_json ? JSON.parse(t.detected_signals_json) : null,
          })),
        });
      }

      // Query episodes across experiments
      case "episodes": {
        const experimentId = searchParams.get("experimentId") || undefined;
        const outcome = searchParams.get("outcome") || undefined;
        const personaId = searchParams.get("personaId") || undefined;
        const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 100;
        const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : 0;

        const episodes = db.queryEpisodes({
          experimentId,
          outcome,
          personaId,
          limit,
          offset,
        });

        return NextResponse.json({
          episodes: episodes.map((ep) => ({
            id: ep.id,
            experimentId: ep.experiment_id,
            episodeNum: ep.episode_num,
            personaId: ep.persona_id,
            personaName: ep.persona_name,
            outcome: ep.outcome,
            totalReturn: ep.total_return,
            turns: ep.turns,
            createdAt: ep.created_at,
          })),
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
