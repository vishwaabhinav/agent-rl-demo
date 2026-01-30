import { NextResponse } from "next/server";
import { getPersonaIds, getPersonaById } from "@/simulation";

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

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
