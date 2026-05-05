import { NextResponse } from "next/server";
import { z } from "zod";

import { mergeAgentsFromDatabase } from "@/ai/agents";
import { runCouncilDebate } from "@/ai/debate-runner";
import { DEMO_RUN_ID } from "@/lib/data/mock";
import { SupabaseDebatePersistence } from "@/lib/db/debate-persistence";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { titleFromGoal } from "@/lib/utils";
import { getAIProvider } from "@/providers";

const createCouncilRunSchema = z.object({
  goal: z.string().min(10),
  targetBuyer: z.string().optional().nullable(),
  productCategory: z.string().optional().nullable(),
  buildTimeLimit: z.string().optional().nullable(),
  preferredStack: z.string().optional().nullable(),
  minimumPrice: z.coerce.number().int().positive().optional().nullable(),
  linkedinAudience: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  marketEvidenceNotes: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createCouncilRunSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid council run input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!hasSupabaseEnv()) {
    return NextResponse.json({
      id: DEMO_RUN_ID,
      status: "completed",
      demo: true,
      message: "Supabase env vars are missing, so the demo council run is shown.",
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

  const input = parsed.data;
  const title = titleFromGoal(input.goal);

  await supabase.from("users").upsert({
    id: user.id,
    email: user.email ?? "unknown@example.com",
  });

  const { data: run, error: createError } = await supabase
    .from("council_runs")
    .insert({
      user_id: user.id,
      title,
      goal: input.goal,
      target_buyer: input.targetBuyer,
      product_category: input.productCategory,
      build_time_limit: input.buildTimeLimit,
      preferred_stack: input.preferredStack,
      minimum_price: input.minimumPrice,
      linkedin_audience: input.linkedinAudience,
      notes: input.notes,
      market_evidence_notes: input.marketEvidenceNotes,
      status: "draft",
    })
    .select("*")
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  try {
    const { data: agentRows } = await supabase
      .from("agents")
      .select("*")
      .eq("enabled", true)
      .order("created_at");

    const artifacts = await runCouncilDebate({
      run: {
        id: run.id,
        userId: user.id,
        title,
        goal: input.goal,
        targetBuyer: input.targetBuyer,
        productCategory: input.productCategory,
        buildTimeLimit: input.buildTimeLimit,
        preferredStack: input.preferredStack,
        minimumPrice: input.minimumPrice,
        linkedinAudience: input.linkedinAudience,
        notes: input.notes,
        marketEvidenceNotes: input.marketEvidenceNotes,
      },
      provider: getAIProvider(),
      agents: mergeAgentsFromDatabase(agentRows),
      persistence: new SupabaseDebatePersistence(supabase, run.id),
    });

    return NextResponse.json({
      id: run.id,
      status: "completed",
      winner: artifacts.winner.title,
    });
  } catch (error) {
    await supabase
      .from("council_runs")
      .update({ status: "failed" })
      .eq("id", run.id);

    return NextResponse.json(
      {
        id: run.id,
        status: "failed",
        error: error instanceof Error ? error.message : "Council run failed.",
      },
      { status: 500 },
    );
  }
}
