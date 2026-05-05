import { NextResponse } from "next/server";

import { mergeAgentsFromDatabase } from "@/ai/agents";
import { createInitialMarketEvidence, runCouncilDebate } from "@/ai/debate-runner";
import type { MarketEvidenceDraft } from "@/ai/types";
import { RunDebugTracer } from "@/lib/debug/run-debug-tracer";
import {
  resetCouncilRunArtifacts,
  SupabaseDebatePersistence,
} from "@/lib/db/debate-persistence";
import { hasGitHubModelsEnv, hasOpenAIEnv, hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/providers";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const tracer = new RunDebugTracer();
  let currentStep = "request_received";

  tracer.startStep("request_received", { runId: id });

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

  const { data: existingMessages } = await supabase
    .from("agent_messages")
    .select("id")
    .eq("council_run_id", id)
    .limit(1);

  if (run.status === "completed") {
    return NextResponse.json({ id, status: "completed", alreadyFinished: true });
  }

  if (run.status === "running" && run.started_at && existingMessages?.length) {
    return NextResponse.json({ id, status: "running", alreadyRunning: true });
  }

  try {
    currentStep = "reset_artifacts";
    tracer.startStep("reset_artifacts");
    await resetCouncilRunArtifacts(supabase, id);
    tracer.completeStep("reset_artifacts");

    currentStep = "load_market_evidence";
    tracer.startStep("load_market_evidence");
    const { data: marketEvidenceRows, error: evidenceError } = await supabase
      .from("market_evidence")
      .select("*")
      .eq("council_run_id", id)
      .order("strength_score", { ascending: false });

    if (evidenceError) {
      throw evidenceError;
    }

    let marketEvidence: MarketEvidenceDraft[] = (marketEvidenceRows ?? []).map((item) => ({
      id: item.id,
      councilRunId: item.council_run_id,
      productIdeaId: item.product_idea_id,
      sourceType: item.source_type,
      sourceName: item.source_name,
      sourceUrl: item.source_url,
      title: item.title,
      content: item.content,
      signalType: item.signal_type,
      strengthScore: item.strength_score,
      createdAt: item.created_at,
    }));

    if (!marketEvidence.length) {
      marketEvidence = createInitialMarketEvidence({
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
      });
    }
    tracer.completeStep("load_market_evidence", { count: marketEvidence.length });

    currentStep = "load_agents";
    tracer.startStep("load_agents");
    const { data: agentRows, error: agentError } = await supabase
      .from("agents")
      .select("*")
      .eq("enabled", true)
      .order("created_at");

    if (agentError) {
      throw agentError;
    }
    tracer.completeStep("load_agents", { agentCount: agentRows?.length ?? 0 });

    currentStep = "create_provider";
    tracer.startStep("create_provider", {
      githubModelsConfigured: hasGitHubModelsEnv(),
      openAIConfigured: hasOpenAIEnv(),
    });
    const provider = getAIProvider();
    tracer.completeStep("create_provider", { provider: provider.name });

    currentStep = "start_debate_runner";
    tracer.startStep("start_debate_runner");
    await supabase
      .from("council_runs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        completed_at: null,
        failed_at: null,
        error_message: null,
        failed_step: null,
        failed_round: null,
        failed_agent: null,
        failed_provider: null,
        failed_model: null,
        current_step: "Starting council debate",
        progress_percent: 1,
        debug_trace: tracer.getTrace(),
      })
      .eq("id", id);

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
        marketEvidence,
      },
      provider,
      agents: mergeAgentsFromDatabase(agentRows),
      persistence: new SupabaseDebatePersistence(supabase, id),
      tracer,
    });

    tracer.completeStep("start_debate_runner");

    currentStep = "update_run_completed";
    tracer.startStep("update_run_completed");
    await supabase
      .from("council_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        error_message: null,
        failed_step: null,
        failed_round: null,
        failed_agent: null,
        failed_provider: null,
        failed_model: null,
        current_round: "Round 7: Generate Complete Final Report",
        current_agent: "Judge Agent",
        current_step: "Council completed",
        current_provider: provider.name,
        current_model: "openai/gpt-4.1",
        progress_percent: 100,
        failed_at: null,
        debug_trace: tracer.getTrace(),
      })
      .eq("id", id);
    tracer.completeStep("update_run_completed");

    return NextResponse.json({
      id,
      status: "completed",
      finalDecision: artifacts.report.finalDecision,
      winner:
        artifacts.report.finalDecision === "build_now"
          ? artifacts.winner.title
          : null,
    });
  } catch (error) {
    const safe = tracer.safeError(error);
    type ErrorWithMeta = Error & {
      failedStep?: string;
      failedRound?: string;
      failedAgent?: string;
      failedProvider?: string;
      failedModel?: string;
    };
    const errMeta = error as ErrorWithMeta;
    const failedStep = errMeta.failedStep ?? currentStep;
    const failedRound = errMeta.failedRound;
    const failedAgent = errMeta.failedAgent;
    const failedProvider = errMeta.failedProvider;
    const failedModel = errMeta.failedModel;

    tracer.failStep(failedStep, error, {
      runId: id,
      failedRound,
      failedAgent,
      failedProvider,
      failedModel,
    });

    await supabase
      .from("council_runs")
      .update({
        status: "failed",
        error_message: safe.message ?? "Council run failed.",
        failed_step: failedStep,
        failed_round: failedRound ?? null,
        failed_agent: failedAgent ?? null,
        failed_provider: failedProvider ?? null,
        failed_model: failedModel ?? null,
        current_step: "Council failed",
        current_round: failedRound ?? null,
        current_agent: failedAgent ?? null,
        current_provider: failedProvider ?? null,
        current_model: failedModel ?? null,
        debug_trace: tracer.getTrace(),
        failed_at: new Date().toISOString(),
      })
      .eq("id", id);

    console.error(
      "COUNCIL_RUN_FAILED\n" +
        `runId: ${id}\n` +
        `step: ${failedStep}\n` +
        `round: ${failedRound ?? ""}\n` +
        `agent: ${failedAgent ?? ""}\n` +
        `provider: ${failedProvider ?? ""}\n` +
        `model: ${failedModel ?? ""}\n` +
        `message: ${safe.message ?? ""}\n` +
        `trace: ${JSON.stringify(tracer.getTrace())}`,
    );

    return NextResponse.json(
      {
        error: "Council run failed",
        id,
        step: failedStep,
        round: failedRound,
        agent: failedAgent,
        provider: failedProvider,
        model: failedModel,
        details: safe.message ?? "Council run failed.",
      },
      { status: 500 },
    );
  }
}
