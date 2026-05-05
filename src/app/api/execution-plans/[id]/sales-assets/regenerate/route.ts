import { NextResponse } from "next/server";

import { regenerateSalesAssetsForPlan } from "@/lib/data/execution";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const assets = await regenerateSalesAssetsForPlan(id);
    return NextResponse.json({ assets });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not regenerate sales assets.";
    const status = message.includes("Authentication") ? 401 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
