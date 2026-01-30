import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getPersonaIds, getPersonaById } from "@/simulation";

const RESULTS_DIR = path.join(process.cwd(), "rl-results");

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

    case "learners":
      try {
        if (!fs.existsSync(RESULTS_DIR)) {
          return NextResponse.json({ learners: [] });
        }
        const files = fs.readdirSync(RESULTS_DIR)
          .filter((f) => f.endsWith(".json"))
          .map((filename) => {
            const filePath = path.join(RESULTS_DIR, filename);
            const stats = fs.statSync(filePath);
            let type: "bandit" | "qlearning" | "unknown" = "unknown";
            if (filename.startsWith("bandit")) type = "bandit";
            else if (filename.startsWith("qlearning")) type = "qlearning";

            // Try to read episode count from file
            let episodesTrained = 0;
            try {
              const content = fs.readFileSync(filePath, "utf-8");
              const data = JSON.parse(content);
              episodesTrained = data.episodesTrained || data.summary?.numEpisodes || 0;
            } catch {
              // Ignore parse errors
            }

            return {
              filename,
              type,
              episodesTrained,
              modifiedAt: stats.mtime.toISOString(),
            };
          })
          .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

        return NextResponse.json({ learners: files });
      } catch (error) {
        console.error("Error listing learners:", error);
        return NextResponse.json({ learners: [] });
      }

    case "load-learner": {
      const filename = searchParams.get("filename");
      if (!filename) {
        return NextResponse.json({ error: "Filename required" }, { status: 400 });
      }

      try {
        const filePath = path.join(RESULTS_DIR, filename);

        // Security: ensure we're not escaping the results directory
        if (!filePath.startsWith(RESULTS_DIR)) {
          return NextResponse.json({ error: "Invalid path" }, { status: 400 });
        }

        if (!fs.existsSync(filePath)) {
          return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(content);

        // Determine learner type from filename
        let type: "bandit" | "qlearning" | "unknown" = "unknown";
        if (filename.startsWith("bandit")) type = "bandit";
        else if (filename.startsWith("qlearning")) type = "qlearning";

        return NextResponse.json({
          type,
          filename,
          data,
        });
      } catch (error) {
        console.error("Error loading learner:", error);
        return NextResponse.json({ error: "Failed to load" }, { status: 500 });
      }
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
