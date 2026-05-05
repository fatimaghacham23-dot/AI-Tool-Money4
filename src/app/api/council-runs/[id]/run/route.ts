import { NextResponse } from "next/server";

import { mergeAgentsFromDatabase } from "@/ai/agents";
import { runCouncilDebate } from "@/ai/debate-runner";
import {
  resetCouncilRunArtifacts,
  SupabaseDebatePersistence,
} from "@/lib/db/debate-persistence";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/providers";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!hasSupabaseEnv()) {
    return NextResponse.json({
      id: "demo-run-1",
      status: "completed",
      demo: true,
    });
  }

  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: run, error: runError } = await supabase
    .from("council_runs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: "Council run not found." }, { status: 404 });
  }

  try {
    await resetCouncilRunArtifacts(supabase, id);

    const { data: agentRows } = await supabase
      .from("agents")
      .select("*")
      .eq("enabled", true)
      .order("created_at");

    const artifacts = await runCouncilDebate({
      run: {
        id: run.id,
        userId: user.id,
        title: run.title,
        goal: run.goal,
        targetBuyer: run.target_buyer,
        productCategory: run.product_category,
        buildTimeLimit: run.build_time_limit,
        preferredStack: run.preferred_stack,
        minimumPrice: run.minimum_price,
        linkedinAudience: run.linkedin_audience,
        notes: run.notes,
        marketEvidenceNotes: run.market_evidence_notes,
      },
      provider: getAIProvider(),
      agents: mergeAgentsFromDatabase(agentRows),
      persistence: new SupabaseDebatePersistence(supabase, id),
    });

    return NextResponse.json({
      id,
      status: "completed",
      winner: artifacts.winner.title,
    });
  } catch (error) {
    await supabase.from("council_runs").update({ status: "failed" }).eq("id", id);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Council run failed." },
      { status: 500 },
    );
  }
}
