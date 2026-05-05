import { hasSupabaseEnv } from "@/lib/env";
import { calculateExecutionProgress } from "@/lib/data/execution";
import { getMockCouncilRun, getMockExecutionPlan } from "@/lib/data/mock";
import { filterFactoryProductIdeas } from "@/lib/data/factory-utils";
import { createClient } from "@/lib/supabase/server";
import type {
  FactoryFilters,
  FactoryProductIdea,
  ProductFactoryDetail,
} from "@/lib/data/types";
import type {
  CouncilRunRow,
  ExecutionPlanRow,
  FinalReportRow,
  MarketEvidenceRow,
  ProductFactoryStatus,
  ProductIdeaInsert,
  ProductIdeaRow,
  ProductScoreRow,
} from "@/types/database";

export type ProductFactoryUpdate = {
  factoryStatus?: ProductFactoryStatus;
  watchlisted?: boolean;
  notes?: string | null;
  rejectedReason?: string | null;
};

export async function listAllProductIdeas(
  filters: FactoryFilters = {},
): Promise<FactoryProductIdea[]> {
  const ideas = await loadFactoryProductIdeas();
  return filterFactoryProductIdeas(ideas, filters);
}

export function filterProductIdeas(
  ideas: FactoryProductIdea[],
  filters: FactoryFilters,
) {
  return filterFactoryProductIdeas(ideas, filters);
}

export async function getProductDetailWithContext(
  productIdeaId: string,
): Promise<ProductFactoryDetail | null> {
  if (!hasSupabaseEnv() || productIdeaId.startsWith("idea-") || productIdeaId.startsWith("demo")) {
    return getMockProductFactoryDetail(productIdeaId);
  }

  const ideas = await loadFactoryProductIdeas();
  const idea = ideas.find((item) => item.id === productIdeaId);

  if (!idea) {
    return null;
  }

  const supabase = await createClient();

  if (!supabase) {
    return getMockProductFactoryDetail(productIdeaId);
  }

  const [{ data: marketEvidence }, execution] = await Promise.all([
    supabase
      .from("market_evidence")
      .select("*")
      .eq("council_run_id", idea.council_run_id)
      .or(`product_idea_id.eq.${idea.id},product_idea_id.is.null`)
      .order("strength_score", { ascending: false }),
    hydrateExecutionContext(idea.executionPlan),
  ]);

  const codexPrompt = extractMarkdownSection(
    idea.finalReport?.report_markdown ?? "",
    "Codex Prompt",
  );

  return {
    idea,
    marketEvidence: marketEvidence ?? [],
    execution,
    salesAssets: execution?.salesAssets ?? [],
    codexPrompt: codexPrompt || null,
  };
}

export async function updateFactoryStatus(
  productIdeaId: string,
  update: ProductFactoryUpdate,
) {
  if (!hasSupabaseEnv() || productIdeaId.startsWith("idea-") || productIdeaId.startsWith("demo")) {
    return updateMockFactoryIdea(productIdeaId, update);
  }

  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  const patch = createFactoryPatch(update);

  const { data, error } = await supabase
    .from("product_ideas")
    .update(patch)
    .eq("id", productIdeaId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Product idea not found.");
  }

  return data;
}

export async function updateProductIdeaNotes(
  productIdeaId: string,
  update: Pick<ProductFactoryUpdate, "notes" | "rejectedReason">,
) {
  return updateFactoryStatus(productIdeaId, update);
}

async function loadFactoryProductIdeas(): Promise<FactoryProductIdea[]> {
  if (!hasSupabaseEnv()) {
    return getMockFactoryProductIdeas();
  }

  const supabase = await createClient();

  if (!supabase) {
    return getMockFactoryProductIdeas();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return getMockFactoryProductIdeas();
  }

  const { data: runs, error: runsError } = await supabase
    .from("council_runs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (runsError || !runs?.length) {
    return [];
  }

  const runIds = runs.map((run) => run.id);
  const [
    { data: ideas },
    { data: executionPlans },
    { data: finalReports },
    { data: marketEvidence },
  ] = await Promise.all([
    supabase
      .from("product_ideas")
      .select("*")
      .in("council_run_id", runIds)
      .order("created_at", { ascending: false }),
    supabase.from("execution_plans").select("*").in("council_run_id", runIds),
    supabase.from("final_reports").select("*").in("council_run_id", runIds),
    supabase.from("market_evidence").select("*").in("council_run_id", runIds),
  ]);

  const ideaRows = ideas ?? [];
  const ideaIds = ideaRows.map((idea) => idea.id);
  const { data: scores } = ideaIds.length
    ? await supabase.from("product_scores").select("*").in("product_idea_id", ideaIds)
    : { data: [] };

  return toFactoryProductIdeas({
    runs,
    ideas: ideaRows,
    scores: scores ?? [],
    executionPlans: executionPlans ?? [],
    finalReports: finalReports ?? [],
    marketEvidence: marketEvidence ?? [],
  });
}

function toFactoryProductIdeas({
  runs,
  ideas,
  scores,
  executionPlans,
  finalReports,
  marketEvidence,
}: {
  runs: CouncilRunRow[];
  ideas: ProductIdeaRow[];
  scores: ProductScoreRow[];
  executionPlans: ExecutionPlanRow[];
  finalReports: FinalReportRow[];
  marketEvidence: MarketEvidenceRow[];
}): FactoryProductIdea[] {
  return ideas
    .map((idea) => {
      const councilRun = runs.find((run) => run.id === idea.council_run_id);

      if (!councilRun) {
        return null;
      }

      const productEvidenceCount = marketEvidence.filter(
        (item) => item.product_idea_id === idea.id,
      ).length;
      const runEvidenceCount = marketEvidence.filter(
        (item) => item.council_run_id === idea.council_run_id,
      ).length;

      return {
        ...idea,
        score: scores.find((score) => score.product_idea_id === idea.id) ?? null,
        councilRun: {
          id: councilRun.id,
          title: councilRun.title,
          status: councilRun.status,
          target_buyer: councilRun.target_buyer,
          market_evidence_notes: councilRun.market_evidence_notes,
          created_at: councilRun.created_at,
          winner_product_id: councilRun.winner_product_id,
        },
        executionPlan:
          executionPlans.find((plan) => plan.council_run_id === idea.council_run_id) ??
          null,
        finalReport:
          finalReports.find((report) => report.council_run_id === idea.council_run_id) ??
          null,
        evidenceCount: productEvidenceCount || runEvidenceCount,
        evidenceStatus: productEvidenceCount
          ? "evidence_backed"
          : runEvidenceCount || councilRun.market_evidence_notes?.trim()
            ? "run_evidence"
            : "needs_validation",
      };
    })
    .filter((idea): idea is FactoryProductIdea => Boolean(idea))
    .sort((a, b) => (b.score?.total_score ?? 0) - (a.score?.total_score ?? 0));
}

async function hydrateExecutionContext(plan: ExecutionPlanRow | null) {
  if (!plan) {
    return null;
  }

  const supabase = await createClient();

  if (!supabase) {
    return null;
  }

  const [{ data: tasks }, { data: salesAssets }] = await Promise.all([
    supabase
      .from("execution_tasks")
      .select("*")
      .eq("execution_plan_id", plan.id)
      .order("sort_order"),
    supabase
      .from("sales_assets")
      .select("*")
      .eq("execution_plan_id", plan.id)
      .order("created_at"),
  ]);
  const taskRows = tasks ?? [];
  const progress = calculateExecutionProgress(taskRows);

  return {
    plan: {
      ...plan,
      progress_percent: progress.progressPercent,
      current_phase: progress.currentPhase,
    },
    tasks: taskRows,
    salesAssets: salesAssets ?? [],
    progress,
  };
}

function getMockFactoryProductIdeas() {
  const council = getMockCouncilRun();
  const execution = getMockExecutionPlan();

  return toFactoryProductIdeas({
    runs: [council.run],
    ideas: council.ideas,
    scores: council.ideas.flatMap((idea) => (idea.score ? [idea.score] : [])),
    executionPlans: [execution.plan],
    finalReports: council.report ? [council.report] : [],
    marketEvidence: council.marketEvidence,
  });
}

function getMockProductFactoryDetail(productIdeaId: string) {
  const ideas = getMockFactoryProductIdeas();
  const idea = ideas.find((item) => item.id === productIdeaId) ?? ideas[0] ?? null;

  if (!idea) {
    return null;
  }

  const council = getMockCouncilRun();
  const execution = getMockExecutionPlan();
  const codexPrompt = extractMarkdownSection(
    council.report?.report_markdown ?? "",
    "Codex Prompt",
  );

  return {
    idea,
    marketEvidence: council.marketEvidence.filter(
      (item) => item.product_idea_id === idea.id || item.product_idea_id === null,
    ),
    execution,
    salesAssets: execution.salesAssets,
    codexPrompt: codexPrompt || null,
  };
}

function updateMockFactoryIdea(
  productIdeaId: string,
  update: ProductFactoryUpdate,
) {
  const idea = getMockFactoryProductIdeas().find((item) => item.id === productIdeaId);

  if (!idea) {
    throw new Error("Product idea not found.");
  }

  return {
    ...idea,
    ...createFactoryPatch(update),
  };
}

function createFactoryPatch(update: ProductFactoryUpdate): Partial<ProductIdeaInsert> {
  const patch: Partial<ProductIdeaInsert> = {};
  const now = new Date().toISOString();

  if (update.factoryStatus) {
    patch.factory_status = update.factoryStatus;

    if (update.factoryStatus === "watchlist") {
      patch.watchlisted = true;
    }

    if (update.factoryStatus === "rejected") {
      patch.watchlisted = false;
    }

    if (update.factoryStatus === "packaged") {
      patch.built_at = now;
    }

    if (update.factoryStatus === "launched") {
      patch.launched_at = now;
    }

    if (update.factoryStatus === "sold") {
      patch.sold_at = now;
    }
  }

  if (typeof update.watchlisted === "boolean") {
    patch.watchlisted = update.watchlisted;
  }

  if ("notes" in update) {
    patch.notes = update.notes;
  }

  if ("rejectedReason" in update) {
    patch.rejected_reason = update.rejectedReason;
  }

  return patch;
}

function extractMarkdownSection(markdown: string, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^|\\n)##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|\\n#\\s+|$)`,
    "i",
  );
  const match = markdown.match(pattern);

  return match?.[2]?.trim() ?? "";
}
