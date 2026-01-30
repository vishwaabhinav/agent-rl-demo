import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const RESULTS_DIR = path.join(process.cwd(), "rl-results");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("file");

  // If no filename, list available files
  if (!filename) {
    try {
      if (!fs.existsSync(RESULTS_DIR)) {
        return NextResponse.json({ files: [] });
      }
      const files = fs.readdirSync(RESULTS_DIR)
        .filter(f => f.endsWith(".json"))
        .sort()
        .reverse(); // newest first
      return NextResponse.json({ files });
    } catch (error) {
      console.error("Error listing experiments:", error);
      return NextResponse.json({ files: [] });
    }
  }

  // Load specific file
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

    // Infer learnerType from filename
    if (filename.startsWith("bandit")) {
      data.learnerType = "bandit";
    } else if (filename.startsWith("qlearning")) {
      data.learnerType = "qlearning";
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading experiment:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
