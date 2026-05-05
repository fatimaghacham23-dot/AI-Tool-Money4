import type {
  CouncilRunInput,
  ExecutionPlanDraft,
  ExecutionTaskDraft,
  MarketEvidenceDraft,
  ProductIdeaDraft,
  SalesAssetDraft,
} from "@/ai/types";

export type ExecutionGeneratorInput = {
  run: CouncilRunInput;
  winner: ProductIdeaDraft;
  report?: {
    reportMarkdown?: string | null;
    linkedinPost?: string | null;
    dmScript?: string | null;
    demoVideoScript?: string | null;
    packagingChecklist?: string[] | null;
  } | null;
  marketEvidence?: MarketEvidenceDraft[];
  totalScore?: number | null;
};

export function generateExecutionPlanDraft({
  run,
  winner,
  report,
  marketEvidence = [],
}: ExecutionGeneratorInput): ExecutionPlanDraft {
  const targetDays = inferTargetDays(run.buildTimeLimit);
  const tasks = [
    ...createValidationTasks(winner, marketEvidence),
    ...createBuildTasks(winner, targetDays),
    ...createPackagingTasks(report?.packagingChecklist),
    ...createLinkedInLaunchTasks(winner),
  ].map((task, index) => ({
    ...task,
    sortOrder: index + 1,
  }));

  return {
    status: "not_started",
    currentPhase: "Validation",
    progressPercent: 0,
    tasks,
    salesAssets: createSalesAssets({ run, winner, report }),
  };
}

export function generateSalesAssetsDraft({
  run,
  winner,
  report,
}: ExecutionGeneratorInput): SalesAssetDraft[] {
  return createSalesAssets({ run, winner, report });
}

function createValidationTasks(
  winner: ProductIdeaDraft,
  marketEvidence: MarketEvidenceDraft[],
): ExecutionTaskDraft[] {
  const evidenceContext = marketEvidence.length
    ? `Use the strongest current evidence as your angle: ${marketEvidence[0].title}.`
    : "Treat demand as unverified and look for real buyer language before building.";

  return [
    task(
      "Validation",
      "Search LinkedIn for 10 posts about this pain",
      `Search for posts where ${winner.targetBuyer.toLowerCase()} complain about ${winner.pain.toLowerCase()}. ${evidenceContext}`,
      "high",
      "Day 1",
    ),
    task(
      "Validation",
      "Comment on 5 relevant posts",
      "Leave useful comments that name the pain and watch whether builders, agencies, or founders engage.",
      "medium",
      "Day 1",
    ),
    task(
      "Validation",
      "DM 10 potential buyers",
      `Ask likely buyers whether owning the ${winner.title} source code would save enough time to justify paying.`,
      "high",
      "Day 1",
    ),
    task(
      "Validation",
      "Ask 5 buyer questions",
      "Ask about source-code ownership, customization needs, price comfort, missing competitor features, and demo proof required.",
      "high",
      "Day 1",
    ),
    task(
      "Validation",
      "Collect 3 serious replies before building",
      "Move forward only if at least three people ask for code, price, demo access, or agency/client usage details.",
      "high",
      "Day 2",
    ),
    task(
      "Validation",
      "Save screenshots and evidence",
      "Store LinkedIn comments, DMs, competitor notes, and pricing reactions so the council evidence layer can be updated later.",
      "medium",
      "Day 2",
    ),
  ];
}

function createBuildTasks(
  winner: ProductIdeaDraft,
  targetDays: "7-day" | "14-day",
): ExecutionTaskDraft[] {
  const dueDays =
    targetDays === "14-day"
      ? {
          setup: "Day 1-2",
          db: "Day 2-3",
          ui: "Day 3-6",
          backend: "Day 5-8",
          ai: "Day 7-10",
          demo: "Day 10-11",
          testing: "Day 12",
          packaging: "Day 13-14",
        }
      : {
          setup: "Day 1",
          db: "Day 1",
          ui: "Day 2-3",
          backend: "Day 3-4",
          ai: "Day 4-5",
          demo: "Day 5-6",
          testing: "Day 6",
          packaging: "Day 7",
        };

  return [
    task(
      "Build",
      "Project setup",
      "Create the Next.js 15 TypeScript app, Tailwind, shadcn/ui-style primitives, env example, lint/typecheck/build scripts, and app shell.",
      "high",
      dueDays.setup,
    ),
    task(
      "Build",
      "Database and auth",
      `Create Supabase schema, RLS, seed data, auth callback, protected routes, and the core records needed for ${winner.title}.`,
      "high",
      dueDays.db,
    ),
    task(
      "Build",
      "Core UI",
      `Build dashboard, create flow, detail page, generation workspace, output viewer/editor, settings, and docs page for ${winner.targetBuyer}.`,
      "high",
      dueDays.ui,
    ),
    task(
      "Build",
      "Backend and API",
      "Implement route handlers/server actions, Zod validation, persistence, exports, audit events, and error handling.",
      "high",
      dueDays.backend,
    ),
    task(
      "Build",
      "AI features",
      `Implement the primary ${winner.title} AI workflow, provider abstraction, structured JSON parsing, fallback output, and quality checks.`,
      "high",
      dueDays.ai,
    ),
    task(
      "Build",
      "Demo data",
      "Create a polished sample scenario with realistic buyer inputs, generated outputs, screenshots, and demo credentials.",
      "medium",
      dueDays.demo,
    ),
    task(
      "Build",
      "Testing",
      "Run typecheck/build, test route handlers and core generation helpers, and verify empty/loading/error states.",
      "medium",
      dueDays.testing,
    ),
    task(
      "Build",
      "Prepare source-code package",
      "Clean the repo, remove private data, confirm env docs, and make sure the product can be installed from scratch by a buyer.",
      "high",
      dueDays.packaging,
    ),
  ];
}

function createPackagingTasks(packagingChecklist?: string[] | null): ExecutionTaskDraft[] {
  const baseTasks = [
    ["README", "Write product overview, buyer use cases, setup, architecture, customization, and troubleshooting sections."],
    [".env.example", "Document every required env var with safe placeholder values."],
    ["Setup guide", "Explain local install, Supabase setup, schema import, seed data, and dev server workflow."],
    ["Deployment guide", "Explain Vercel + Supabase deployment, auth redirect settings, env vars, and production checks."],
    ["Seed data", "Include realistic demo data that proves the product workflow immediately after install."],
    ["Demo credentials", "Provide safe demo login instructions or magic-link flow notes."],
    ["Screenshots", "Capture dashboard, create flow, AI output, settings, and export/report views."],
    ["Demo video", "Record or script a short source-code buyer walkthrough."],
    ["License file", "Add Lite, Pro, and Agency source-code usage terms."],
    ["Changelog", "Create v1.0.0 release notes and buyer-facing update history."],
    ["Zip package", "Create final package checklist and verify no secrets or node_modules are included."],
  ];
  const checklistHints = (packagingChecklist ?? []).join(" ");

  return baseTasks.map(([title, description], index) =>
    task(
      "Packaging",
      title,
      checklistHints.includes(title)
        ? `${description} This is explicitly referenced in the final report packaging checklist.`
        : description,
      index <= 3 ? "high" : "medium",
      index <= 4 ? "Day 7" : "Launch prep",
    ),
  );
}

function createLinkedInLaunchTasks(winner: ProductIdeaDraft): ExecutionTaskDraft[] {
  return [
    task(
      "LinkedIn Launch",
      "Create teaser post",
      `Post the pain and build-in-public angle for ${winner.title} before revealing the full source-code package.`,
      "medium",
      "Day 6",
    ),
    task(
      "LinkedIn Launch",
      "Create demo video",
      "Record a 60-90 second before/after demo that ends by showing the repo, schema, prompts, and setup docs.",
      "high",
      "Day 7",
    ),
    task(
      "LinkedIn Launch",
      "Publish launch post",
      "Publish the final post with a clear source-code offer and a comment keyword such as code, price, or send me.",
      "high",
      "Launch day",
    ),
    task(
      "LinkedIn Launch",
      "Reply to comments",
      "Reply fast with a useful proof point, then move serious interest into DMs.",
      "high",
      "Launch day",
    ),
    task(
      "LinkedIn Launch",
      "DM interested people",
      "Send the demo, pricing, license terms, and a direct question about whether they want Lite, Pro, or Agency access.",
      "high",
      "Launch day",
    ),
    task(
      "LinkedIn Launch",
      "Collect feedback",
      "Track objections, buyer language, pricing reactions, and feature requests from comments and DMs.",
      "medium",
      "Day +1",
    ),
    task(
      "LinkedIn Launch",
      "Update offer",
      "Revise the package, pricing message, README, and launch copy based on the strongest buyer objections.",
      "medium",
      "Day +2",
    ),
  ];
}

function createSalesAssets({
  run,
  winner,
  report,
}: ExecutionGeneratorInput): SalesAssetDraft[] {
  const price = winner.pricingIdea || formatMinimumPrice(run.minimumPrice);
  const demoHook = `Show the messy workflow, run ${winner.title}, then reveal the full source code, schema, prompts, docs, and seed data.`;
  const linkedinPost =
    report?.linkedinPost?.trim() ||
    `I built ${winner.title} as a full-source-code product for ${winner.targetBuyer}.\n\nThe pain:\n${winner.pain}\n\nThe demo:\n${demoHook}\n\nThis is not another subscription. Buyers get the codebase, prompts, schema, setup docs, seed data, and license options.\n\nComment "code" if you want the walkthrough.`;
  const dmScript =
    report?.dmScript?.trim() ||
    `Hey, I am packaging ${winner.title} as a complete source-code product for ${winner.targetBuyer.toLowerCase()}.\n\nIt is built to save implementation time and make customization/resale easier.\n\nWant me to send the demo and package details?`;

  return [
    {
      assetType: "linkedin_launch_post",
      title: "LinkedIn Launch Post",
      content: linkedinPost,
    },
    {
      assetType: "teaser_post",
      title: "Teaser Post",
      content: `I am building a source-code package for ${winner.targetBuyer} who are tired of this problem:\n\n${winner.pain}\n\nThe goal is simple: buy the code, customize it, and ship faster than starting from scratch.\n\nI will share the demo soon. Comment "preview" if you want to see it.`,
    },
    {
      assetType: "comment_reply",
      title: "Comment Reply",
      content: `Appreciate it. The package includes the full ${winner.title} codebase, Supabase schema, AI prompts, setup docs, seed data, and license options. I can DM you the demo and pricing.`,
    },
    {
      assetType: "dm_script",
      title: "DM Script",
      content: dmScript,
    },
    {
      assetType: "follow_up_dm",
      title: "Follow-up DM",
      content: `Quick follow-up: the main reason people buy this is to skip the blank repo and customize a working ${winner.title} instead.\n\nDoes your use case lean more toward using it internally, customizing it for clients, or reselling it as part of an agency package?`,
    },
    {
      assetType: "pricing_message",
      title: "Pricing Message",
      content: `The planned source-code pricing is:\n\nLite: single-project license, core app, schema, prompts, and setup guide.\nPro: commercial license with seed data, customization guide, and demo assets.\nAgency: client-use license with white-label rights and resale-ready packaging notes.\n\nTarget pricing: ${price}.`,
    },
    {
      assetType: "license_explanation",
      title: "License Explanation",
      content: `Lite is for one internal project. Pro is for a business that wants to customize and deploy commercially. Agency is for teams that want to adapt ${winner.title} for client work, white-label demos, or repeatable implementation services.\n\nAll tiers are source-code sales, not SaaS subscriptions.`,
    },
  ];
}

function task(
  phase: ExecutionTaskDraft["phase"],
  title: string,
  description: string,
  priority: ExecutionTaskDraft["priority"],
  dueDay: string,
): ExecutionTaskDraft {
  return {
    phase,
    title,
    description,
    status: "todo",
    priority,
    dueDay,
    sortOrder: 0,
  };
}

function inferTargetDays(value?: string | null): "7-day" | "14-day" {
  return value?.includes("14") || value?.includes("21") ? "14-day" : "7-day";
}

function formatMinimumPrice(value?: number | null) {
  if (!value) {
    return "Lite $149, Pro $299, Agency $599";
  }

  return `starting around $${value}`;
}
