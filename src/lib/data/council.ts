import { notFound } from "next/navigation";

import { mergeAgentsFromDatabase } from "@/ai/agents";
import { hasSupabaseEnv } from "@/lib/env";
import { getMockCouncilRun, getMockDashboardRuns } from "@/lib/data/mock";
import type { CouncilRunView, DashboardRun } from "@/lib/data/types";
import { createClient } from "@/lib/supabase/server";
import type {
  AgentMessageRow,
  AgentRow,
  CouncilRunRow,
  DebateRoundRow,
  FinalReportRow,
  MarketEvidenceRow,
  ProductIdeaRow,
  ProductScoreRow,
} from "@/types/database";

export async function getDashboardRuns(): Promise<DashboardRun[]> {
  if (!hasSupabaseEnv()) {
    return getMockDashboardRuns();
  }

  const supabase = await createClient();
  if (!supabase) {
    return getMockDashboardRuns();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return getMockDashboardRuns();
  }

  const { data: runs, error } = await supabase
    .from("council_runs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !runs) {
    return [];
  }

  const winnerIds = runs
    .map((run) => run.winner_product_id)
    .filter((id): id is string => Boolean(id));

  const { data: winners } = winnerIds.length
    ? await supabase
        .from("product_ideas")
        .select("id,title")
        .in("id", winnerIds)
    : { data: [] };

  const { data: scores } = winnerIds.length
    ? await supabase
        .from("product_scores")
        .select("product_idea_id,total_score")
        .in("product_idea_id", winnerIds)
    : { data: [] };

  const runIds = runs.map((run) => run.id);
  const { data: reports } = runIds.length
    ? await supabase
        .from("final_reports")
        .select("council_run_id,final_decision,day_one_sale_probability")
        .in("council_run_id", runIds)
    : { data: [] };
  const { data: evidence } = runIds.length
    ? await supabase
        .from("market_evidence")
        .select("council_run_id")
        .in("council_run_id", runIds)
    : { data: [] };

  return runs.map((run) => ({
    ...(() => {
      const report = reports?.find((item) => item.council_run_id === run.id);
      const winnerScore =
        scores?.find((score) => score.product_idea_id === run.winner_product_id)
          ?.total_score ?? null;

      return {
        finalDecision: report?.final_decision ?? null,
        totalScore: winnerScore ?? report?.day_one_sale_probability ?? null,
      };
    })(),
    id: run.id,
    title: run.title,
    status: run.status,
    winnerProduct:
      winners?.find((winner) => winner.id === run.winner_product_id)?.title ??
      null,
    createdAt: run.created_at,
    evidenceCount:
      evidence?.filter((item) => item.council_run_id === run.id).length ?? 0,
  }));
}

export async function getCouncilRun(id: string): Promise<CouncilRunView> {
  if (!hasSupabaseEnv() || id.startsWith("demo")) {
    return getMockCouncilRun();
  }

  const supabase = await createClient();
  if (!supabase) {
    return getMockCouncilRun();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return getMockCouncilRun();
  }

  const { data: run, error: runError } = await supabase
    .from("council_runs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (runError || !run) {
    notFound();
  }

  const [
    { data: agents },
    { data: rounds },
    { data: messages },
    { data: ideas },
    { data: marketEvidence },
    { data: report },
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
      .order("created_at"),
    supabase
      .from("product_ideas")
      .select("*")
      .eq("council_run_id", id)
      .order("created_at"),
    supabase
      .from("market_evidence")
      .select("*")
      .eq("council_run_id", id)
      .order("strength_score", { ascending: false }),
    supabase
      .from("final_reports")
      .select("*")
      .eq("council_run_id", id)
      .maybeSingle(),
  ]);

  const ideaIds = (ideas ?? []).map((idea) => idea.id);
  const { data: scores } = ideaIds.length
    ? await supabase
        .from("product_scores")
        .select("*")
        .in("product_idea_id", ideaIds)
    : { data: [] };

  return toCouncilRunView({
    run,
    agents: agents ?? [],
    rounds: rounds ?? [],
    messages: messages ?? [],
    ideas: ideas ?? [],
    marketEvidence: marketEvidence ?? [],
    scores: scores ?? [],
    report: report ?? null,
  });
}

function toCouncilRunView({
  run,
  agents,
  rounds,
  messages,
  ideas,
  scores,
  marketEvidence,
  report,
}: {
  run: CouncilRunRow;
  agents: AgentRow[];
  rounds: DebateRoundRow[];
  messages: AgentMessageRow[];
  ideas: ProductIdeaRow[];
  scores: ProductScoreRow[];
  marketEvidence: MarketEvidenceRow[];
  report: FinalReportRow | null;
}): CouncilRunView {
  const mergedAgents = mergeAgentsFromDatabase(agents);
  const winnerIdea = run.winner_product_id
    ? ideas.find((idea) => idea.id === run.winner_product_id) ?? null
    : null;

  return {
    run,
    agents: mergedAgents,
    rounds: rounds.map((round) => ({
      ...round,
      messages: messages
        .filter((message) => message.debate_round_id === round.id)
        .map((message) => ({
          ...message,
          agent:
            mergedAgents.find((agent) => agent.id === message.agent_id) ??
            mergedAgents.find((agent) => agent.key === message.agent_id) ??
            null,
        })),
    })),
    ideas: ideas.map((idea) => ({
      ...idea,
      score: scores.find((score) => score.product_idea_id === idea.id) ?? null,
    })),
    marketEvidence,
    winner: winnerIdea
      ? {
          ...winnerIdea,
          score:
            scores.find((score) => score.product_idea_id === winnerIdea.id) ?? null,
        }
      : null,
    report,
  };
}
