import { NextResponse } from "next/server";
import { getPersonaIds, getPersonaById } from "@/simulation";
import * as db from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  switch (action) {
    case "personas":
      return NextResponse.json({
        personas: getPersonaIds().map((id) => {
          const persona = getPersonaById(id);
          return {
            id,
            name: persona?.name,
            description: persona?.description,
            pathLength: persona?.path.length,
            path: persona?.path,
          };
        }),
      });

    case "policies":
    case "learners": {
      // List trained policies from database
      try {
        const experiments = db.listExperiments("training");
        const policies = experiments
          .filter((exp) => exp.learner_state) // Only include those with saved state
          .map((exp) => {
            // Parse metrics if available
            let successRate = 0;
            let avgReturn = 0;
            if (exp.final_metrics_json) {
              try {
                const metrics = JSON.parse(exp.final_metrics_json);
                successRate = metrics.successRate || 0;
                avgReturn = metrics.avgReturn || 0;
              } catch {
                // Ignore parse errors
              }
            }

            // Get episode count from stats
            const stats = db.getExperimentStats(exp.id);

            return {
              id: exp.id,
              type: exp.learner_type || "unknown",
              episodesTrained: stats.totalEpisodes,
              successRate,
              avgReturn,
              createdAt: exp.created_at,
              trainTimeMs: exp.train_time_ms,
            };
          });

        return NextResponse.json({ policies, learners: policies });
      } catch (error) {
        console.error("Error listing policies:", error);
        return NextResponse.json({ policies: [], learners: [] });
      }
    }

    case "load-policy":
    case "load-learner": {
      const policyId = searchParams.get("id") || searchParams.get("filename");
      if (!policyId) {
        return NextResponse.json({ error: "Policy ID required" }, { status: 400 });
      }

      try {
        const experiment = db.getExperiment(policyId);
        if (!experiment) {
          return NextResponse.json({ error: "Policy not found" }, { status: 404 });
        }

        if (!experiment.learner_state) {
          return NextResponse.json({ error: "No learner state saved" }, { status: 404 });
        }

        // Parse the learner state
        const learnerState = JSON.parse(experiment.learner_state);

        return NextResponse.json({
          id: experiment.id,
          type: experiment.learner_type,
          learnerState,
          config: experiment.config_json ? JSON.parse(experiment.config_json) : null,
          metrics: experiment.final_metrics_json ? JSON.parse(experiment.final_metrics_json) : null,
          createdAt: experiment.created_at,
        });
      } catch (error) {
        console.error("Error loading policy:", error);
        return NextResponse.json({ error: "Failed to load policy" }, { status: 500 });
      }
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
