import { NextResponse } from "next/server";

import { mergeAgentsFromDatabase } from "@/ai/agents";
import { DEMO_RUN_ID } from "@/lib/data/mock";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const includeDebug = url.searchParams.get("debug") === "true";

  if (!hasSupabaseEnv() || id.startsWith("demo")) {
    return NextResponse.json({
      id: DEMO_RUN_ID,
      status: "completed",
      current_round: "Round 7: Generate Complete Final Report",
      current_agent: "Judge Agent",
      current_step: "Demo council completed",
      current_provider: "github-models",
      current_model: "openai/gpt-4.1",
      progress_percent: 100,
      rounds: [],
      messages: [],
      productIdeasCount: 5,
      scoresCount: 5,
      hasFinalReport: true,
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

  const [
    { data: agents },
    { data: rounds },
    { data: messages },
    { count: productIdeasCount },
    { count: scoresCount },
    { data: finalReport },
  ] = await Promise.all([
    supabase.from("agents").select("*").order("created_at"),
    supabase
      .from("debate_rounds")
      .select("*")
      .eq("council_run_id", id)
      .order("round_number"),
    supabase
      .from("agent_messages")
      .select("*")
      .eq("council_run_id", id)
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("product_ideas")
      .select("id", { count: "exact", head: true })
      .eq("council_run_id", id),
    supabase
      .from("product_scores")
      .select("id,product_ideas!inner(council_run_id)", { count: "exact", head: true })
      .eq("product_ideas.council_run_id", id),
    supabase
      .from("final_reports")
      .select("id")
      .eq("council_run_id", id)
      .maybeSingle(),
  ]);

  const mergedAgents = mergeAgentsFromDatabase(agents);
  const messageItems = (messages ?? []).map((message) => {
    const agent =
      mergedAgents.find((item) => item.id === message.agent_id) ??
      mergedAgents.find((item) => item.key === message.agent_id) ??
      null;

    return {
      id: message.id,
      roundId: message.debate_round_id,
      agentName: agent?.name ?? "Council system",
      agentRole: agent?.role ?? "Automated debate event",
      provider: message.model_provider ?? agent?.modelProvider ?? run.current_provider,
      model: message.model_name ?? agent?.modelName ?? run.current_model,
      content: message.content,
      createdAt: message.created_at,
    };
  });

  return NextResponse.json(
    {
      id: run.id,
      status: run.status,
      current_round: run.current_round,
      current_agent: run.current_agent,
      current_step: run.current_step,
      current_provider: run.current_provider,
      current_model: run.current_model,
      progress_percent: run.progress_percent,
      error_message: run.error_message,
      failed_step: run.failed_step,
      failed_round: run.failed_round,
      failed_agent: run.failed_agent,
      failed_provider: run.failed_provider,
      failed_model: run.failed_model,
      debug_trace: run.status === "failed" || includeDebug ? run.debug_trace : null,
      rounds: (rounds ?? []).map((round) => ({
        id: round.id,
        roundNumber: round.round_number,
        roundType: round.round_type,
        title: round.title,
        createdAt: round.created_at,
        messages: messageItems.filter((message) => message.roundId === round.id),
      })),
      messages: messageItems,
      productIdeasCount: productIdeasCount ?? 0,
      scoresCount: scoresCount ?? 0,
      hasFinalReport: Boolean(finalReport),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
