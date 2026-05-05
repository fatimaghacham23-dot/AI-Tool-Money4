import { DEFAULT_AGENTS } from "@/ai/agents";
import { generateExecutionPlanDraft } from "@/ai/execution-generator";
import { expandMockIdeas } from "@/ai/mock-data";
import { createDeterministicReport } from "@/ai/report-generator";
import { explainScoresLocally, scoreIdeasLocally, sortByScore } from "@/ai/scoring";
import type { ScoredProductIdea } from "@/ai/types";
import type {
  AgentMessageRow,
  CouncilRunRow,
  DebateRoundRow,
  ExecutionPlanRow,
  ExecutionTaskRow,
  FinalReportRow,
  MarketEvidenceRow,
  ProductIdeaRow,
  ProductScoreRow,
  SalesAssetRow,
} from "@/types/database";
import type { CouncilRunView, DashboardRun, ExecutionPlanView } from "@/lib/data/types";

export const DEMO_RUN_ID = "demo-run-1";

const createdAt = new Date().toISOString();

const demoRun: CouncilRunRow = {
  id: DEMO_RUN_ID,
  user_id: "demo-user",
  title: "Highest-probability source-code product",
  goal: "Find me the highest-probability full-source-code product I can build in 7-14 days and sell on LinkedIn.",
  target_buyer: "Agencies, freelancers, and technical founders",
  product_category: "AI business tools and full-stack templates",
  build_time_limit: "7-14 days",
  preferred_stack: "Next.js 15, TypeScript, Tailwind, Supabase, OpenAI",
  minimum_price: 199,
  linkedin_audience: "Software engineers, agency owners, indie hackers",
  notes: "Prioritize source-code packages over subscriptions.",
  market_evidence_notes:
    "LinkedIn agency owners often complain about client status chaos, weekly update writing, and rebuilding the same portals. A freelancer DM said they would pay for a clean client portal starter if it included Supabase schema, prompts, and white-label docs.",
  status: "completed",
  winner_product_id: "idea-1",
  error_message: null,
  failed_step: null,
  failed_round: null,
  failed_agent: null,
  failed_provider: null,
  failed_model: null,
  debug_trace: null,
  current_round: null,
  current_agent: null,
  current_step: null,
  current_provider: null,
  current_model: null,
  progress_percent: 100,
  started_at: null,
  completed_at: null,
  failed_at: null,
  created_at: createdAt,
  updated_at: createdAt,
};

const ideas = expandMockIdeas().slice(0, 5);
const marketEvidenceRows: MarketEvidenceRow[] = [
  {
    id: "evidence-1",
    council_run_id: DEMO_RUN_ID,
    product_idea_id: "idea-1",
    source_type: "linkedin",
    source_name: "LinkedIn comments",
    source_url: null,
    title: "Agency owners complain about client update chaos",
    content:
      "Multiple agency-style comments mention that weekly client updates, approvals, and file handoffs are still scattered across Slack, email, and Notion.",
    signal_type: "pain",
    strength_score: 8,
    created_at: createdAt,
  },
  {
    id: "evidence-2",
    council_run_id: DEMO_RUN_ID,
    product_idea_id: "idea-1",
    source_type: "manual",
    source_name: "Buyer DM",
    source_url: null,
    title: "Developer wants a source-code client portal starter",
    content:
      "A developer buyer said a clean Next/Supabase client portal with AI summaries, docs, and seed data would save at least a week.",
    signal_type: "willingness_to_pay",
    strength_score: 9,
    created_at: createdAt,
  },
  {
    id: "evidence-3",
    council_run_id: DEMO_RUN_ID,
    product_idea_id: null,
    source_type: "competitor",
    source_name: "Generic portal tools",
    source_url: null,
    title: "Hosted portals do not give agencies source ownership",
    content:
      "Most client portal tools sell subscriptions, not editable code that agencies can white-label or resell.",
    signal_type: "competitor_weakness",
    strength_score: 7,
    created_at: createdAt,
  },
];
const marketEvidenceDrafts = marketEvidenceRows.map((item) => ({
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
const scores = scoreIdeasLocally(ideas, marketEvidenceDrafts);
const scoreExplanations = explainScoresLocally(ideas, marketEvidenceDrafts);
const scoredIdeas: ScoredProductIdea[] = ideas.map((idea, index) => ({
  ...idea,
  id: `idea-${index + 1}`,
  status: index === 0 ? "winner" : "backup",
  score: {
    ...scores[index],
    productIdeaId: `idea-${index + 1}`,
  },
  scoreExplanations: scoreExplanations[index],
}));

const winner = sortByScore(scoredIdeas)[0];

const report = createDeterministicReport(demoRunToInput(), winner, {
  marketEvidence: marketEvidenceDrafts,
});

const productRows: ProductIdeaRow[] = scoredIdeas.map((idea, index) => ({
  id: idea.id ?? `idea-${index + 1}`,
  council_run_id: DEMO_RUN_ID,
  title: idea.title,
  description: idea.description,
  target_buyer: idea.targetBuyer,
  pain: idea.pain,
  why_buy_source_code: idea.whyBuySourceCode,
  mvp_features: idea.mvpFeatures,
  full_features: idea.fullFeatures,
  pricing_idea: idea.pricingIdea,
  risks: idea.risks,
  status: idea.status ?? "backup",
  factory_status:
    index === 0
      ? "winner"
      : index === 1
        ? "validating"
        : index === 2
          ? "watchlist"
          : index === 3
            ? "rejected"
            : "generated",
  watchlisted: index === 2,
  built_at: null,
  launched_at: null,
  sold_at: null,
  rejected_reason: index === 3 ? "Lower price ceiling versus agency products." : null,
  notes:
    index === 1
      ? "Needs two buyer calls before a build slot."
      : index === 2
        ? "Good backup if agency demand shifts toward templates."
        : null,
  created_at: createdAt,
}));

const scoreRows: ProductScoreRow[] = scoredIdeas.map((idea, index) => ({
  id: `score-${index + 1}`,
  product_idea_id: idea.id ?? `idea-${index + 1}`,
  buyer_urgency: idea.score.buyer_urgency,
  existing_purchase_behavior: idea.score.existing_purchase_behavior,
  linkedin_demo_strength: idea.score.linkedin_demo_strength,
  comment_dm_likelihood: idea.score.comment_dm_likelihood,
  actual_tool_gap: idea.score.actual_tool_gap,
  source_code_gap: idea.score.source_code_gap,
  manual_workaround_pain: idea.score.manual_workaround_pain,
  hidden_workflow_specificity: idea.score.hidden_workflow_specificity,
  price_believability: idea.score.price_believability,
  build_speed: idea.score.build_speed,
  total_score: idea.score.total_score,
  score_explanations: idea.scoreExplanations ?? {},
}));

const rounds: DebateRoundRow[] = [
  {
    id: "round-1",
    council_run_id: DEMO_RUN_ID,
    round_number: 1,
    round_type: "idea_generation",
    title: "Round 1: Generate 12 Product Ideas",
    created_at: createdAt,
  },
  {
    id: "round-2",
    council_run_id: DEMO_RUN_ID,
    round_number: 2,
    round_type: "skeptic_filter",
    title: "Round 2: Skeptic Rejects Weak Ideas",
    created_at: createdAt,
  },
  {
    id: "round-3",
    council_run_id: DEMO_RUN_ID,
    round_number: 3,
    round_type: "shortlist",
    title: "Round 3: Keep Top 5 Ideas",
    created_at: createdAt,
  },
  {
    id: "round-4",
    council_run_id: DEMO_RUN_ID,
    round_number: 4,
    round_type: "agent_debate",
    title: "Round 4: Agents Debate Each Idea",
    created_at: createdAt,
  },
  {
    id: "round-5",
    council_run_id: DEMO_RUN_ID,
    round_number: 5,
    round_type: "scoring",
    title: "Round 5: Score Each Idea",
    created_at: createdAt,
  },
  {
    id: "round-6",
    council_run_id: DEMO_RUN_ID,
    round_number: 6,
    round_type: "judge",
    title: "Round 6: Judge Makes Build Gate Decision",
    created_at: createdAt,
  },
  {
    id: "round-7",
    council_run_id: DEMO_RUN_ID,
    round_number: 7,
    round_type: "final_report",
    title: "Round 7: Generate Complete Final Report",
    created_at: createdAt,
  },
];

const messages: AgentMessageRow[] = [
  {
    id: "message-1",
    council_run_id: DEMO_RUN_ID,
    debate_round_id: "round-1",
    agent_id: "source-code-market",
    model_provider: "github-models",
    model_name: "openai/gpt-4o-mini",
    content:
      "Generated twelve source-code product candidates. The strongest cluster is agency-resellable AI business tools with clear demos and low build complexity.",
    created_at: createdAt,
  },
  {
    id: "message-2",
    council_run_id: DEMO_RUN_ID,
    debate_round_id: "round-2",
    agent_id: "skeptic",
    model_provider: "github-models",
    model_name: "openai/gpt-4o-mini",
    content:
      "Rejected vague tools, crowded generic templates, and products with low willingness to pay. The winners must look valuable as source code, not only as hosted apps.",
    created_at: createdAt,
  },
  {
    id: "message-3",
    council_run_id: DEMO_RUN_ID,
    debate_round_id: "round-4",
    agent_id: "linkedin-virality",
    model_provider: "github-models",
    model_name: "openai/gpt-4o",
    content:
      "AI Client Portal Starter Kit has the best LinkedIn demo arc: messy client communication, one portal, AI weekly summary, branded approval flow, then the code package reveal.",
    created_at: createdAt,
  },
  {
    id: "message-4",
    council_run_id: DEMO_RUN_ID,
    debate_round_id: "round-4",
    agent_id: "developer-buyer",
    model_provider: "github-models",
    model_name: "openai/gpt-4.1",
    content:
      "As a developer buyer, I would pay if the code is clean, schema-first, and easy to customize. Include seed data, role permissions, and a prompt customization guide.",
    created_at: createdAt,
  },
  {
    id: "message-5",
    council_run_id: DEMO_RUN_ID,
    debate_round_id: "round-4",
    agent_id: "agency-buyer",
    model_provider: "github-models",
    model_name: "openai/gpt-4o-mini",
    content:
      "The client portal has repeatable agency value. One purchase can become a client deliverable, a monthly service wrapper, or a white-label starter for multiple projects.",
    created_at: createdAt,
  },
  {
    id: "message-6",
    council_run_id: DEMO_RUN_ID,
    debate_round_id: "round-5",
    agent_id: "pricing",
    model_provider: "github-models",
    model_name: "openai/gpt-4.1",
    content: scoredIdeas
      .map((idea) => `${idea.title}: ${idea.score.total_score}/100`)
      .join("\n"),
    created_at: createdAt,
  },
  {
    id: "message-7",
    council_run_id: DEMO_RUN_ID,
    debate_round_id: "round-6",
    agent_id: "judge",
    model_provider: "github-models",
    model_name: "openai/gpt-4.1",
    content: `Build now. Build this first.\n\nWinner: ${winner.title}. Day-One Sale Probability: ${winner.score.total_score}/100. It has the cleanest buyer story, the strongest agency resale value, and the fastest path to a polished LinkedIn demo.`,
    created_at: createdAt,
  },
];

const finalReportRow: FinalReportRow = {
  id: "report-1",
  council_run_id: DEMO_RUN_ID,
  winner_product_id: winner.id ?? "idea-1",
  final_decision: report.finalDecision ?? "build_now",
  day_one_sale_probability: report.dayOneSaleProbability ?? winner.score.total_score,
  report_markdown: report.reportMarkdown,
  linkedin_post: report.linkedinPost,
  dm_script: report.dmScript,
  demo_video_script: report.demoVideoScript,
  build_plan: report.buildPlan,
  packaging_checklist: report.packagingChecklist,
  pre_sell_pack: report.preSellPack ?? {},
  created_at: createdAt,
};

const executionDraft = generateExecutionPlanDraft({
  run: demoRunToInput(),
  winner,
  report: {
    reportMarkdown: finalReportRow.report_markdown,
    linkedinPost: finalReportRow.linkedin_post,
    dmScript: finalReportRow.dm_script,
    demoVideoScript: finalReportRow.demo_video_script,
    packagingChecklist: finalReportRow.packaging_checklist,
  },
  marketEvidence: marketEvidenceDrafts,
  totalScore: winner.score.total_score,
});

const executionPlanRow: ExecutionPlanRow = {
  id: "demo-execution-plan-1",
  council_run_id: DEMO_RUN_ID,
  status: executionDraft.status,
  current_phase: executionDraft.currentPhase,
  progress_percent: executionDraft.progressPercent,
  created_at: createdAt,
  updated_at: createdAt,
};

const executionTaskRows: ExecutionTaskRow[] = executionDraft.tasks.map((task, index) => ({
  id: `demo-execution-task-${index + 1}`,
  execution_plan_id: executionPlanRow.id,
  phase: task.phase,
  title: task.title,
  description: task.description,
  status: task.status,
  priority: task.priority,
  due_day: task.dueDay,
  sort_order: task.sortOrder,
  created_at: createdAt,
  updated_at: createdAt,
}));

const salesAssetRows: SalesAssetRow[] = executionDraft.salesAssets.map((asset, index) => ({
  id: `demo-sales-asset-${index + 1}`,
  execution_plan_id: executionPlanRow.id,
  asset_type: asset.assetType,
  title: asset.title,
  content: asset.content,
  created_at: createdAt,
  updated_at: createdAt,
}));

export function getMockDashboardRuns(): DashboardRun[] {
  return [
    {
      id: DEMO_RUN_ID,
      title: demoRun.title,
      status: demoRun.status,
      winnerProduct: winner.title,
      finalDecision: finalReportRow.final_decision,
      totalScore: winner.score.total_score,
      createdAt,
      evidenceCount: marketEvidenceRows.length,
    },
  ];
}

export function getMockCouncilRun(): CouncilRunView {
  return {
    run: demoRun,
    agents: DEFAULT_AGENTS,
    rounds: rounds.map((round) => ({
      ...round,
      messages: messages
        .filter((message) => message.debate_round_id === round.id)
        .map((message) => ({
          ...message,
          agent:
            DEFAULT_AGENTS.find((agent) => agent.key === message.agent_id) ??
            DEFAULT_AGENTS.find((agent) => agent.name === message.agent_id) ??
            null,
        })),
    })),
    ideas: productRows.map((idea) => ({
      ...idea,
      score:
        scoreRows.find((score) => score.product_idea_id === idea.id) ?? null,
    })),
    marketEvidence: marketEvidenceRows,
    winner: {
      ...productRows[0],
      score: scoreRows[0],
    },
    report: finalReportRow,
  };
}

export function getMockExecutionPlan(): ExecutionPlanView {
  return {
    plan: executionPlanRow,
    tasks: executionTaskRows,
    salesAssets: salesAssetRows,
    progress: {
      totalTasks: executionTaskRows.length,
      completedTasks: executionTaskRows.filter((task) => task.status === "done").length,
      progressPercent: executionPlanRow.progress_percent,
      currentPhase: executionPlanRow.current_phase,
    },
  };
}

function demoRunToInput() {
  return {
    id: demoRun.id,
    title: demoRun.title,
    goal: demoRun.goal,
    targetBuyer: demoRun.target_buyer,
    productCategory: demoRun.product_category,
    buildTimeLimit: demoRun.build_time_limit,
    preferredStack: demoRun.preferred_stack,
    minimumPrice: demoRun.minimum_price,
    linkedinAudience: demoRun.linkedin_audience,
    notes: demoRun.notes,
    marketEvidenceNotes: demoRun.market_evidence_notes,
  };
}


export function getMockPackagePlan(productIdeaId: string) {
  if (productIdeaId !== "idea-1") {
    return null;
  }

  return {
    id: "package-idea-1",
    product_idea_id: "idea-1",
    package_markdown: "# Demo Package Plan\nThis is a deterministic package plan for idea-1.",
    readme_markdown: "# README Outline\n- What this product is\n- Who it is for\n- Features",
    quickstart_markdown: "# Quickstart\n1. Install dependencies\n2. Configure Supabase",
    license_markdown: "# License\nLite / Pro / Agency",
    sales_page_copy: "# Sales Copy\nHeadline + features + pricing.",
    demo_video_script: "# Demo Script\n30s / 90s / LinkedIn",
    onboarding_email: "# Onboarding\nPurchase + setup + follow-up",
    created_at: createdAt,
    updated_at: createdAt,
  };
}
