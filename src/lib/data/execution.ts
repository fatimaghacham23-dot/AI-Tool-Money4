import {
  generateExecutionPlanDraft,
  generateSalesAssetsDraft,
} from "@/ai/execution-generator";
import { hasSupabaseEnv } from "@/lib/env";
import { getCouncilRun } from "@/lib/data/council";
import { getMockExecutionPlan } from "@/lib/data/mock";
import type {
  CouncilRunView,
  ExecutionPlanView,
  ExecutionProgress,
  ProductIdeaView,
} from "@/lib/data/types";
import { createClient } from "@/lib/supabase/server";
import type {
  CouncilRunRow,
  ExecutionPlanRow,
  ExecutionTaskRow,
  ExecutionTaskStatus,
  MarketEvidenceRow,
} from "@/types/database";

export async function getOrCreateExecutionPlan(
  councilRunId: string,
  council?: CouncilRunView,
): Promise<ExecutionPlanView | null> {
  if (!hasSupabaseEnv() || councilRunId.startsWith("demo")) {
    return getMockExecutionPlan();
  }

  const supabase = await createClient();

  if (!supabase) {
    return getMockExecutionPlan();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return getMockExecutionPlan();
  }

  const { data: run, error: runError } = await supabase
    .from("council_runs")
    .select("*")
    .eq("id", councilRunId)
    .eq("user_id", user.id)
    .single();

  if (runError || !run) {
    return null;
  }

  const { data: existingPlan } = await supabase
    .from("execution_plans")
    .select("*")
    .eq("council_run_id", councilRunId)
    .maybeSingle();

  if (existingPlan) {
    return hydrateExecutionPlan(existingPlan);
  }

  const sourceCouncil = council ?? (await getCouncilRun(councilRunId));

  if (!sourceCouncil.winner || !sourceCouncil.report) {
    return null;
  }

  const draft = generateExecutionPlanDraft({
    run: councilRunToInput(run),
    winner: productIdeaToDraft(sourceCouncil.winner),
    report: {
      reportMarkdown: sourceCouncil.report.report_markdown,
      linkedinPost: sourceCouncil.report.linkedin_post,
      dmScript: sourceCouncil.report.dm_script,
      demoVideoScript: sourceCouncil.report.demo_video_script,
      packagingChecklist: sourceCouncil.report.packaging_checklist,
    },
    marketEvidence: sourceCouncil.marketEvidence.map(marketEvidenceToDraft),
    totalScore: sourceCouncil.winner.score?.total_score ?? null,
  });

  const { data: plan, error: planError } = await supabase
    .from("execution_plans")
    .insert({
      council_run_id: councilRunId,
      status: draft.status,
      current_phase: draft.currentPhase,
      progress_percent: draft.progressPercent,
    })
    .select("*")
    .single();

  if (planError || !plan) {
    const { data: racedPlan } = await supabase
      .from("execution_plans")
      .select("*")
      .eq("council_run_id", councilRunId)
      .maybeSingle();

    return racedPlan ? hydrateExecutionPlan(racedPlan) : null;
  }

  await supabase.from("execution_tasks").insert(
    draft.tasks.map((task) => ({
      execution_plan_id: plan.id,
      phase: task.phase,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_day: task.dueDay,
      sort_order: task.sortOrder,
    })),
  );

  await supabase.from("sales_assets").insert(
    draft.salesAssets.map((asset) => ({
      execution_plan_id: plan.id,
      asset_type: asset.assetType,
      title: asset.title,
      content: asset.content,
    })),
  );

  return hydrateExecutionPlan(plan);
}

export async function updateExecutionTaskStatus(
  taskId: string,
  status: ExecutionTaskStatus,
) {
  if (!hasSupabaseEnv() || taskId.startsWith("demo")) {
    return { task: null, progress: getMockExecutionPlan().progress };
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

  const { data: updatedTask, error } = await supabase
    .from("execution_tasks")
    .update({ status })
    .eq("id", taskId)
    .select("*")
    .single();

  if (error || !updatedTask) {
    throw new Error(error?.message ?? "Execution task not found.");
  }

  const progress = await refreshExecutionPlanProgress(updatedTask.execution_plan_id);

  return {
    task: updatedTask,
    progress,
  };
}

export async function regenerateSalesAssetsForPlan(planId: string) {
  if (!hasSupabaseEnv() || planId.startsWith("demo")) {
    return getMockExecutionPlan().salesAssets;
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

  const { data: plan, error: planError } = await supabase
    .from("execution_plans")
    .select("*")
    .eq("id", planId)
    .single();

  if (planError || !plan) {
    throw new Error("Execution plan not found.");
  }

  const council = await getCouncilRun(plan.council_run_id);

  if (!council.winner || !council.report) {
    throw new Error("Cannot regenerate assets before the council has a Build now decision and report.");
  }

  const draftAssets = generateSalesAssetsDraft({
    run: councilRunToInput(council.run),
    winner: productIdeaToDraft(council.winner),
    report: {
      reportMarkdown: council.report.report_markdown,
      linkedinPost: council.report.linkedin_post,
      dmScript: council.report.dm_script,
      demoVideoScript: council.report.demo_video_script,
      packagingChecklist: council.report.packaging_checklist,
    },
    marketEvidence: council.marketEvidence.map(marketEvidenceToDraft),
    totalScore: council.winner.score?.total_score ?? null,
  });

  await supabase.from("sales_assets").delete().eq("execution_plan_id", plan.id);

  const { data: assets, error: insertError } = await supabase
    .from("sales_assets")
    .insert(
      draftAssets.map((asset) => ({
        execution_plan_id: plan.id,
        asset_type: asset.assetType,
        title: asset.title,
        content: asset.content,
      })),
    )
    .select("*")
    .order("created_at");

  if (insertError || !assets) {
    throw new Error(insertError?.message ?? "Could not regenerate sales assets.");
  }

  return assets;
}

export function calculateExecutionProgress(
  tasks: ExecutionTaskRow[],
): ExecutionProgress {
  const totalTasks = tasks.length;
  const activeTasks = tasks.filter((task) => task.status !== "skipped");
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const progressPercent = activeTasks.length
    ? Math.round((completedTasks / activeTasks.length) * 100)
    : 0;
  const currentTask = [...tasks]
    .sort((a, b) => a.sort_order - b.sort_order)
    .find((task) => !["done", "skipped"].includes(task.status));

  return {
    totalTasks,
    completedTasks,
    progressPercent,
    currentPhase: currentTask?.phase ?? "Completed",
  };
}

async function hydrateExecutionPlan(
  plan: ExecutionPlanRow,
): Promise<ExecutionPlanView> {
  const supabase = await createClient();

  if (!supabase) {
    return getMockExecutionPlan();
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
  const assetRows = salesAssets ?? [];
  const progress = calculateExecutionProgress(taskRows);

  return {
    plan: {
      ...plan,
      progress_percent: progress.progressPercent,
      current_phase: progress.currentPhase,
    },
    tasks: taskRows,
    salesAssets: assetRows,
    progress,
  };
}

async function refreshExecutionPlanProgress(planId: string) {
  const supabase = await createClient();

  if (!supabase) {
    return getMockExecutionPlan().progress;
  }

  const { data: tasks } = await supabase
    .from("execution_tasks")
    .select("*")
    .eq("execution_plan_id", planId)
    .order("sort_order");
  const progress = calculateExecutionProgress(tasks ?? []);

  await supabase
    .from("execution_plans")
    .update({
      current_phase: progress.currentPhase,
      progress_percent: progress.progressPercent,
      status: executionStatusFromProgress(progress),
    })
    .eq("id", planId);

  return progress;
}

function executionStatusFromProgress(progress: ExecutionProgress) {
  if (progress.totalTasks > 0 && progress.progressPercent === 100) {
    return "completed";
  }

  switch (progress.currentPhase) {
    case "Validation":
      return "validating";
    case "Build":
      return "building";
    case "Packaging":
      return "packaging";
    case "LinkedIn Launch":
      return "launching";
    default:
      return "not_started";
  }
}

function councilRunToInput(run: CouncilRunRow) {
  return {
    id: run.id,
    userId: run.user_id,
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
  };
}

function productIdeaToDraft(idea: ProductIdeaView) {
  return {
    id: idea.id,
    title: idea.title,
    description: idea.description,
    targetBuyer: idea.target_buyer ?? "Source-code buyers",
    pain: idea.pain ?? idea.description,
    whyBuySourceCode:
      idea.why_buy_source_code ??
      "Buyers want the implementation, prompts, schema, and packaging instead of rebuilding from scratch.",
    mvpFeatures: idea.mvp_features,
    fullFeatures: idea.full_features,
    pricingIdea: idea.pricing_idea ?? "Lite $149, Pro $299, Agency $599",
    risks: idea.risks,
    status: idea.status,
  };
}

function marketEvidenceToDraft(item: MarketEvidenceRow) {
  return {
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
  };
}
