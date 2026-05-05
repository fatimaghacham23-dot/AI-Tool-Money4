import { NextResponse } from "next/server";
import { z } from "zod";

import { createInitialMarketEvidence } from "@/ai/debate-runner";
import { RunDebugTracer } from "@/lib/debug/run-debug-tracer";
import { DEMO_RUN_ID } from "@/lib/data/mock";
import { hasGitHubModelsEnv, hasOpenAIEnv, hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { titleFromGoal } from "@/lib/utils";

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
  const tracer = new RunDebugTracer();

  tracer.startStep("request_received");

  let body: unknown;
  try {

    tracer.startStep("parse_payload");
    body = await request.json();
    tracer.completeStep("parse_payload", {
      keys: body && typeof body === "object" ? Object.keys(body as Record<string, unknown>) : [],
    });
  } catch (error) {
    tracer.failStep("parse_payload", error);
    return NextResponse.json(
      { error: "Council run failed", step: "parse_payload", details: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = createCouncilRunSchema.safeParse(body);

  if (!parsed.success) {
    tracer.failStep("parse_payload", parsed.error);
    return NextResponse.json(
      { error: "Invalid council run input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }


  tracer.startStep("env_check", {
    hasSupabaseEnv: hasSupabaseEnv(),
    hasGitHubModelsEnv: hasGitHubModelsEnv(),
    hasOpenAIEnv: hasOpenAIEnv(),
    debugCouncilRuns: process.env.DEBUG_COUNCIL_RUNS === "true",
  });

  if (!hasSupabaseEnv()) {
    tracer.completeStep("env_check", { demoMode: true });
    return NextResponse.json({
      id: DEMO_RUN_ID,
      status: "completed",
      demo: true,
      message: "Supabase env vars are missing, so the demo council run is shown.",
    });
  }

  tracer.completeStep("env_check", { demoMode: false });


  tracer.startStep("create_supabase_client");
  const supabase = await createClient();

  if (!supabase) {
    tracer.failStep("create_supabase_client", new Error("Supabase is not configured."));
    return NextResponse.json(
      { error: "Council run failed", step: "create_supabase_client", details: "Supabase is not configured." },
      { status: 500 },
    );
  }
  tracer.completeStep("create_supabase_client");


  tracer.startStep("auth_check");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    tracer.failStep("auth_check", new Error("Authentication required."));
    return NextResponse.json(
      { error: "Council run failed", step: "auth_check", details: "Authentication required." },
      { status: 401 },
    );
  }
  tracer.completeStep("auth_check", { userId: user.id });

  const input = parsed.data;
  const title = titleFromGoal(input.goal);


  tracer.startStep("supabase_insert_user_if_needed");
  const { error: upsertUserError } = await supabase.from("users").upsert({
    id: user.id,
    email: user.email ?? "unknown@example.com",
  });
  if (upsertUserError) {
    tracer.failStep("supabase_insert_user_if_needed", upsertUserError);
    return NextResponse.json(
      {
        error: "Council run failed",
        step: "supabase_insert_user_if_needed",
        details: upsertUserError.message,
      },
      { status: 500 },
    );
  }
  tracer.completeStep("supabase_insert_user_if_needed");


  tracer.startStep("insert_council_run");
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
      status: "running",
      debug_trace: tracer.getTrace(),
    })
    .select("*")
    .single();

  if (createError || !run) {
    tracer.failStep("insert_council_run", createError ?? new Error("Failed to create council run"));
    return NextResponse.json(
      {
        error: "Council run failed",
        step: "insert_council_run",
        details: createError?.message ?? "Failed to create council run",
      },
      { status: 500 },
    );
  }

  tracer.completeStep("insert_council_run", { runId: run.id });
  await supabase
    .from("council_runs")
    .update({
      current_step: "Queued for council debate",
      progress_percent: 0,
    })
    .eq("id", run.id);


  tracer.startStep("insert_market_evidence");
  const initialEvidence = createInitialMarketEvidence({
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
  });

  if (initialEvidence.length) {
    const { error: evidenceError } = await supabase.from("market_evidence").insert(
      initialEvidence.map((item) => ({
        council_run_id: run.id,
        product_idea_id: null,
        source_type: item.sourceType,
        source_name: item.sourceName,
        source_url: item.sourceUrl ?? null,
        title: item.title,
        content: item.content,
        signal_type: item.signalType,
        strength_score: item.strengthScore,
      })),
    );

    if (evidenceError) {
      tracer.failStep("insert_market_evidence", evidenceError);
      return NextResponse.json(
        {
          error: "Council run failed",
          step: "insert_market_evidence",
          details: evidenceError.message,
        },
        { status: 500 },
      );
    }
  }

  tracer.completeStep("insert_market_evidence", { count: initialEvidence.length });

  await supabase
    .from("council_runs")
    .update({ debug_trace: tracer.getTrace() })
    .eq("id", run.id);

  return NextResponse.json({
    id: run.id,
    status: "running",
    redirectUrl: `/council/${run.id}/debate`,
  });
}
