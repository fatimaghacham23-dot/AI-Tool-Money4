import { SCORING_RUBRIC } from "@/ai/scoring";
import type {
  CouncilRunInput,
  FinalReportDraft,
  MarketEvidenceDraft,
  ProductIdeaDraft,
  ProductScoreExplanations,
  ScoredProductIdea,
} from "@/ai/types";

export type ReportContext = {
  previousMessages?: Array<{
    roundNumber: number;
    roundTitle: string;
    agentName: string;
    agentRole: string;
    content: string;
  }>;
  shortlistedIdeas?: ProductIdeaDraft[];
  rejectedIdeas?: Array<{ title: string; reason: string; risks: string[] }>;
  criticisms?: Array<{
    agentName: string;
    title: string;
    criticism: string;
    riskLevel: "low" | "medium" | "high";
    roundNumber: number;
  }>;
  refinements?: Array<{
    agentName: string;
    title: string;
    refinement: string;
    roundNumber: number;
  }>;
  scoredIdeas?: ScoredProductIdea[];
  scoreHistory?: Array<{
    title: string;
    totalScore: number;
    explanations: ProductScoreExplanations;
    reason: string;
  }>;
  marketEvidence?: MarketEvidenceDraft[];
  whyOthersLost?: Array<{ title: string; reason: string }>;
  finalDecisionReason?: string;
};

export function buildReportPrompt(
  run: CouncilRunInput,
  winner: ScoredProductIdea,
  context: ReportContext = {},
) {
  return `
Create the final private council report for Ahmad.

Goal:
${run.goal}

Winner:
${JSON.stringify(winner, null, 2)}

Council context:
${JSON.stringify(context, null, 2)}

Rules:
- Choose one product only.
- Include the exact phrase: "Build this first."
- Optimize for a complete source-code package sold from LinkedIn, not a SaaS subscription.
- Include why the other top ideas lost.
- Use concrete architecture, schema, routes, UI pages, pricing, launch post, DM script, demo video script, and packaging checklist.
- Return JSON with keys: reportMarkdown, linkedinPost, dmScript, demoVideoScript, buildPlan, packagingChecklist, codexBuildBlueprint, codexPrompt.
- The reportMarkdown must use these sections:
  # Build This First
  Product name
  One-sentence offer
  Target buyer
  Pain
  Why people buy the source code
  Why this can sell on LinkedIn
  Demo hook
  MVP features
  Full product features
  AI features
  Technical architecture
  Database schema
  API routes
  UI pages
  Build plan
  Pricing tiers
  LinkedIn launch post
  DM script
  Demo video script
  Packaging checklist
  Risks
  Why rejected ideas lost
  # Market Evidence Used
  # Codex Build Blueprint
- The Codex Build Blueprint section must include Product Summary, MVP Scope, Recommended Tech Stack, App Pages, Database Schema, API Routes / Server Actions, AI Features, UI Components, Build Phases, Packaging for Source-Code Sale, and Codex Prompt.
- The Codex Build Blueprint section must include Validation Before Build with LinkedIn searches, buyer questions, positive validation signals, and a minimum validation threshold.
- The Codex Prompt must start exactly with: "You are my senior full-stack engineer. Build this full-source-code product..."
`;
}

export function createDeterministicReport(
  run: CouncilRunInput,
  winner: ScoredProductIdea,
  context: ReportContext = {},
): FinalReportDraft {
  const offer = `A complete ${winner.title} source-code package for ${winner.targetBuyer.toLowerCase()} that saves weeks of product setup.`;
  const demoHook = createDemoHook(winner);
  const scoreRows = SCORING_RUBRIC.map((item) => {
    const value = winner.score[item.key];
    const explanation =
      winner.scoreExplanations?.[item.key] ??
      context.scoreHistory?.find((score) => score.title === winner.title)?.explanations[
        item.key
      ] ??
      item.description;
    return `| ${item.label} | ${value}/10 | ${explanation} |`;
  }).join("\n");
  const buildPlan = createBuildPlan(run);
  const pricingTiers = createPricingTiers(winner);
  const rejectedLosses = createRejectedLosses(winner, context);
  const marketEvidence = context.marketEvidence ?? [];
  const evidenceAnalysis = createMarketEvidenceAnalysis(winner, marketEvidence);
  const risks = uniqueStrings([
    ...winner.risks,
    ...(context.criticisms ?? [])
      .filter((criticism) => criticism.title === winner.title)
      .map((criticism) => criticism.criticism),
  ]);
  const blueprint = createCodexBuildBlueprint({
    run,
    winner,
    offer,
    demoHook,
    buildPlan,
    pricingTiers,
    risks,
    rejectedLosses,
    marketEvidence,
    evidenceAnalysis,
  });
  const codexPrompt = createCodexPrompt({
    run,
    winner,
    offer,
    demoHook,
    buildPlan,
    pricingTiers,
    risks,
    rejectedLosses,
    marketEvidence,
    evidenceAnalysis,
  });

  const reportMarkdown = `# Build This First

Build this first.

## Product Name
${winner.title}

## One-Sentence Offer
${offer}

## Target Buyer
${winner.targetBuyer}

## Pain
${winner.pain}

## Why People Buy The Source Code
${winner.whyBuySourceCode}

## Why This Can Sell On LinkedIn
It has a visible before-and-after demo: a painful workflow becomes a polished AI-assisted output, and the post can reveal that buyers get the full codebase instead of another subscription.

## Demo Hook
${demoHook}

## Score Breakdown
| Category | Score | Explanation |
| --- | ---: | --- |
${scoreRows}
| Total | ${winner.score.total_score}/100 | Best combined probability after council debate. |

## MVP Features
${winner.mvpFeatures.map((feature) => `- ${feature}`).join("\n")}

## Full Product Features
${winner.fullFeatures.map((feature) => `- ${feature}`).join("\n")}

## AI Features
- Prompt-driven generation or analysis for the core buyer workflow
- Saved AI outputs with editable history
- Buyer-customizable prompt templates
- AI summary, recommendation, or rewrite step that is obvious in the demo

## Technical Architecture
- Next.js 15 App Router for the product shell and private/admin surfaces
- TypeScript domain modules for prompts, scoring, exports, and workflow state
- Supabase Auth and PostgreSQL for users, projects, generated outputs, and settings
- OpenAI provider behind a provider adapter for future model routing
- Tailwind CSS and shadcn/ui-style components for a premium buyer-ready UI

## Database Schema
- users: owner and team accounts
- workspaces: buyer organizations or client spaces
- projects: buyer-created product/workflow records
- source_inputs: uploaded notes, documents, or structured inputs
- generated_outputs: AI drafts, scores, summaries, or reports
- prompt_templates: editable prompts and tone presets
- brand_settings: white-label colors, copy, and logo metadata
- audit_events: activity history for demo credibility

## API Routes
- POST /api/generate: run the primary AI workflow
- GET /api/projects: list saved projects
- POST /api/projects: create a project
- GET /api/projects/[id]: load one project
- PATCH /api/projects/[id]: update metadata or output
- POST /api/projects/[id]/export: export markdown/PDF-ready output
- GET /api/settings: load buyer prompt and brand settings
- PATCH /api/settings: update prompts and white-label settings

## UI Pages
- Dashboard
- New project
- Project detail
- AI generation workspace
- Output preview/editor
- Export view
- Settings
- Buyer documentation page

## Build Plan
${buildPlan.map((item) => `- ${item.day}: ${item.focus} - ${item.deliverable}`).join("\n")}

## Pricing Tiers
- Lite: ${pricingTiers.lite}
- Pro: ${pricingTiers.pro}
- Agency: ${pricingTiers.agency}

## LinkedIn Launch Post
${createLinkedInPost(winner, demoHook)}

## DM Script
${createDMScript(winner)}

## Demo Video Script
${createDemoScript(winner, demoHook)}

## Packaging Checklist
- Clean README and install guide
- .env.example with all required variables
- Supabase SQL schema and seed data
- Architecture notes and folder walkthrough
- Prompt customization guide
- Demo credentials and sample scenario
- License terms for Lite, Pro, and Agency buyers
- Screenshots and short demo video
- Changelog and buyer handoff checklist

## Risks
${risks.map((risk) => `- ${risk}`).join("\n")}

## Why Rejected Ideas Lost
${rejectedLosses.map((item) => `- ${item.title}: ${item.reason}`).join("\n")}

# Market Evidence Used

## Strongest Evidence
${evidenceAnalysis.strongestEvidence.map((item) => `- ${item.title} (${item.sourceType}/${item.signalType}, ${item.strengthScore}/10): ${item.content}`).join("\n") || "- No direct market evidence was provided."}

## Weakest Assumptions
${evidenceAnalysis.weakestAssumptions.map((item) => `- ${item}`).join("\n")}

## Evidence Gaps
${evidenceAnalysis.evidenceGaps.map((item) => `- ${item}`).join("\n")}

## What Ahmad Should Verify Manually Before Building
${evidenceAnalysis.manualVerification.map((item) => `- ${item}`).join("\n")}

# Codex Build Blueprint

${blueprint}

## Codex Prompt
\`\`\`text
${codexPrompt}
\`\`\`
`;

  return {
    winnerProductId: winner.id,
    reportMarkdown,
    linkedinPost: createLinkedInPost(winner, demoHook),
    dmScript: createDMScript(winner),
    demoVideoScript: createDemoScript(winner, demoHook),
    buildPlan,
    packagingChecklist: [
      "Clean README and install guide",
      ".env.example with all required variables",
      "Supabase SQL schema and seed data",
      "Architecture notes and folder walkthrough",
      "Prompt customization guide",
      "Demo credentials and sample scenario",
      "License terms for Lite, Pro, and Agency buyers",
      "Screenshots and short demo video",
      "Changelog and buyer handoff checklist",
    ],
    codexBuildBlueprint: blueprint,
    codexPrompt,
  };
}

type BlueprintInput = {
  run: CouncilRunInput;
  winner: ScoredProductIdea;
  offer: string;
  demoHook: string;
  buildPlan: Array<{ day: string; focus: string; deliverable: string }>;
  pricingTiers: ReturnType<typeof createPricingTiers>;
  risks: string[];
  rejectedLosses: Array<{ title: string; reason: string }>;
  marketEvidence: MarketEvidenceDraft[];
  evidenceAnalysis: ReturnType<typeof createMarketEvidenceAnalysis>;
};

function createCodexBuildBlueprint({
  run,
  winner,
  offer,
  demoHook,
  buildPlan,
  pricingTiers,
  risks,
  rejectedLosses,
  marketEvidence,
  evidenceAnalysis,
}: BlueprintInput) {
  const targetDays = (run.buildTimeLimit ?? "").includes("14") ? "14-day" : "7-day";
  const excludedFeatures = [
    "Native mobile app",
    "Multi-tenant marketplace",
    "Complex billing portal unless the buyer specifically needs Stripe",
    "Deep third-party integrations before the core demo works",
    "Enterprise role matrix beyond owner/admin/member",
  ];
  const appPages = createAppPages(winner);
  const databaseTables = createDatabaseTables(winner);
  const apiRoutes = createApiRoutes(winner);
  const aiFeatures = createAIFeatures(winner);
  const uiComponents = createUIComponents();
  const sourceBuyerType = inferSourceBuyerType(winner);

  return `## Product Summary
- Product name: ${winner.title}
- One-sentence offer: ${offer}
- Target buyer: ${winner.targetBuyer}
- Source-code buyer type: ${sourceBuyerType}
- Main use case: ${winner.pain}

## MVP Scope
- Exact MVP features:
${winner.mvpFeatures.map((feature) => `  - ${feature}`).join("\n")}
- Excluded features:
${excludedFeatures.map((feature) => `  - ${feature}`).join("\n")}
- Build constraints:
  - One senior full-stack engineer
  - ${targetDays} target
  - Prioritize a strong LinkedIn demo over broad feature coverage
  - Keep the product sellable as source code with docs, seed data, and clean architecture
- Target: ${targetDays}

## Recommended Tech Stack
- Frontend: Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui-style components
- Backend: Next.js route handlers and server actions
- Database: Supabase PostgreSQL
- Auth: Supabase Auth with magic link/email auth
- Payments if needed: Stripe checkout only if the buyer wants a hosted monetized variant; not required for the source-code sale package
- AI provider: OpenAI for V1 behind a provider adapter
- Deployment target: Vercel for app, Supabase for database/auth/storage
- File storage if needed: Supabase Storage
- Email provider if needed: Resend for transactional notifications

## App Pages
${appPages
  .map(
    (page) => `### ${page.route}
- Purpose: ${page.purpose}
- Main components: ${page.components.join(", ")}
- User actions: ${page.actions.join(", ")}
- Data needed: ${page.data.join(", ")}`,
  )
  .join("\n\n")}

## Database Schema
${databaseTables
  .map(
    (table) => `### ${table.name}
- Columns: ${table.columns.join(", ")}
- Relationships: ${table.relationships.join(", ")}
- Important indexes: ${table.indexes.join(", ")}
- RLS/auth assumptions: ${table.rls}`,
  )
  .join("\n\n")}

## API Routes / Server Actions
${apiRoutes
  .map(
    (route) => `### ${route.name}
- Route: ${route.route}
- Method: ${route.method}
- Input: ${route.input}
- Output: ${route.output}
- Business logic: ${route.logic}
- Error handling: ${route.errorHandling}`,
  )
  .join("\n\n")}

## AI Features
${aiFeatures
  .map(
    (feature) => `### ${feature.name}
- Prompt purpose: ${feature.promptPurpose}
- Required inputs: ${feature.inputs.join(", ")}
- Expected output format: ${feature.outputFormat}
- Fallback behavior: ${feature.fallback}
- Safety/quality rules: ${feature.rules.join(", ")}`,
  )
  .join("\n\n")}

## UI Components
${uiComponents.map((component) => `- ${component}`).join("\n")}

## Build Phases
- Council day plan:
${buildPlan.map((item) => `  - ${item.day}: ${item.focus} - ${item.deliverable}`).join("\n")}
- Phase 1: Project setup
  - Create Next.js 15 TypeScript app, Tailwind, shadcn/ui-style primitives, lint/typecheck scripts, env example
- Phase 2: Database/auth
  - Create Supabase schema, RLS policies, seed data, auth callback, protected app shell
- Phase 3: Core UI
  - Build dashboard, create/edit flow, detail pages, tables, forms, loading/empty/error states
- Phase 4: Core backend
  - Implement server actions/routes, validation, persistence, exports, and audit logging
- Phase 5: AI features
  - Add provider adapter, prompts, structured JSON parsing, retries/fallbacks, saved AI outputs
- Phase 6: Polish/demo data
  - Add sample scenario, responsive UI polish, screenshots, demo-ready seed records
- Phase 7: Packaging for sale
  - Add README, setup/deployment guides, license, changelog, buyer onboarding, demo video script

## Packaging for Source-Code Sale
- License packaging target:
  - Lite: ${pricingTiers.lite}
  - Pro: ${pricingTiers.pro}
  - Agency: ${pricingTiers.agency}
- README sections:
  - Product overview
  - Buyer use cases
  - Tech stack
  - Features
  - Architecture
  - Database setup
  - AI prompt customization
  - Deployment
  - License terms
  - Troubleshooting
- .env.example:
  - NEXT_PUBLIC_APP_URL
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY
  - OPENAI_API_KEY
  - OPENAI_MODEL
  - RESEND_API_KEY if email is included
  - STRIPE_SECRET_KEY only if payments are included
- Setup guide:
  - Install dependencies
  - Create Supabase project
  - Run schema SQL
  - Configure env vars
  - Seed demo data
  - Run dev server
- Deployment guide:
  - Deploy to Vercel
  - Add env vars
  - Connect Supabase
  - Verify auth redirects
  - Run production build
- Seed data: demo user/workspace, sample project, sample AI output, sample settings
- Demo credentials: one buyer/admin demo account or magic-link instructions
- License file: Lite, Pro, and Agency source-code usage terms
- Screenshots needed: dashboard, create flow, AI output, settings, export/report view
- Demo video script: ${demoHook}
- Changelog: v1.0.0 initial source-code release
- Buyer onboarding instructions:
  - Read README
  - Configure Supabase
  - Customize prompts and branding
  - Replace seed data
  - Deploy
  - Record their own demo

# Validation Before Build
- Market evidence status: ${marketEvidence.length ? "Evidence-backed" : "Assumption-heavy"}
- Strongest current evidence:
${evidenceAnalysis.strongestEvidence.map((item) => `  - ${item.title} (${item.strengthScore}/10): ${item.content}`).join("\n") || "  - No direct evidence yet."}
- 5 LinkedIn posts Ahmad should search for:
${createLinkedInSearches(winner).map((item) => `  - ${item}`).join("\n")}
- 5 buyer questions to ask:
${createBuyerQuestions(winner).map((item) => `  - ${item}`).join("\n")}
- 5 comments/DMs that would count as positive validation:
${createPositiveValidationSignals(winner).map((item) => `  - ${item}`).join("\n")}
- Minimum validation threshold before building:
  - Before spending more than 2 days building, Ahmad should get at least 5 interested comments or 3 serious DMs.
  - At least one signal should mention willingness to pay, source-code ownership, or agency/client reuse.
  - If only likes/views appear, keep researching before building.

## Risks
${risks.map((risk) => `- ${risk}`).join("\n")}

## Why Rejected Ideas Lost
${rejectedLosses.map((item) => `- ${item.title}: ${item.reason}`).join("\n")}
`;
}

function createCodexPrompt({
  run,
  winner,
  offer,
  demoHook,
  buildPlan,
  pricingTiers,
  risks,
  rejectedLosses,
  marketEvidence,
  evidenceAnalysis,
}: BlueprintInput) {
  const appPages = createAppPages(winner);
  const databaseTables = createDatabaseTables(winner);
  const apiRoutes = createApiRoutes(winner);
  const aiFeatures = createAIFeatures(winner);

  return `You are my senior full-stack engineer. Build this full-source-code product...

Build it end to end.

Product description:
- Name: ${winner.title}
- Offer: ${offer}
- Target buyer: ${winner.targetBuyer}
- Build target: ${run.buildTimeLimit ?? "7-14 days"}
- Main pain: ${winner.pain}
- Why buyers want source code: ${winner.whyBuySourceCode}
- LinkedIn demo hook: ${demoHook}

Important product rule:
- This is a complete source-code product to sell, not a SaaS subscription business.
- Optimize for a polished buyer-ready repo, clear docs, seed data, and a demo that proves saved build time.

Tech stack:
- Frontend: Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui-style components
- Backend: Next.js route handlers/server actions
- Database/auth/storage: Supabase PostgreSQL, Supabase Auth, Supabase Storage if uploads are needed
- AI provider: OpenAI behind a provider abstraction
- Deployment: Vercel + Supabase
- Email: Resend only if notifications are included
- Payments: Stripe only if this product needs a hosted monetized variant; do not build payments by default

Features:
- MVP features:
${winner.mvpFeatures.map((feature) => `  - ${feature}`).join("\n")}
- Full product features:
${winner.fullFeatures.map((feature) => `  - ${feature}`).join("\n")}
- Excluded for V1:
  - Native mobile app
  - Marketplace
  - Enterprise permissions
  - Deep integrations
  - Payment flows unless clearly required

Pages:
${appPages
  .map(
    (page) => `- ${page.route}: ${page.purpose}. Components: ${page.components.join(", ")}. Actions: ${page.actions.join(", ")}. Data: ${page.data.join(", ")}.`,
  )
  .join("\n")}

Database:
${databaseTables
  .map(
    (table) => `- ${table.name}: columns ${table.columns.join(", ")}. Relationships: ${table.relationships.join(", ")}. Indexes: ${table.indexes.join(", ")}. RLS: ${table.rls}.`,
  )
  .join("\n")}

APIs/server actions:
${apiRoutes
  .map(
    (route) => `- ${route.method} ${route.route} (${route.name}): input ${route.input}; output ${route.output}; logic ${route.logic}; errors ${route.errorHandling}.`,
  )
  .join("\n")}

AI prompts/features:
${aiFeatures
  .map(
    (feature) => `- ${feature.name}: ${feature.promptPurpose}. Inputs: ${feature.inputs.join(", ")}. Output: ${feature.outputFormat}. Fallback: ${feature.fallback}. Rules: ${feature.rules.join(", ")}.`,
  )
  .join("\n")}

Build plan:
${buildPlan.map((item) => `- ${item.day}: ${item.focus} - ${item.deliverable}`).join("\n")}

Pricing/packaging target:
- Lite: ${pricingTiers.lite}
- Pro: ${pricingTiers.pro}
- Agency: ${pricingTiers.agency}

Risks to design around:
${risks.map((risk) => `- ${risk}`).join("\n")}

Validation before build:
- Evidence status: ${marketEvidence.length ? "Evidence-backed" : "Assumption-heavy"}
- Strongest evidence: ${evidenceAnalysis.strongestEvidence[0]?.title ?? "No direct evidence yet"}
- Search LinkedIn for:
${createLinkedInSearches(winner).map((item) => `  - ${item}`).join("\n")}
- Ask buyers:
${createBuyerQuestions(winner).map((item) => `  - ${item}`).join("\n")}
- Positive validation threshold: get at least 5 interested comments or 3 serious DMs before spending more than 2 days building.

Rejected ideas lost because:
${rejectedLosses.map((item) => `- ${item.title}: ${item.reason}`).join("\n")}

Packaging requirements:
- README with overview, setup, architecture, customization, deployment, prompt guide, license terms, and troubleshooting
- .env.example with all required variables
- Supabase schema SQL and seed data
- Demo credentials or magic-link demo instructions
- License file with Lite, Pro, and Agency usage terms
- Screenshots folder and demo video script
- Changelog
- Buyer onboarding instructions

Verification commands:
- npm.cmd run typecheck
- npm.cmd run build
- npm.cmd run lint if lint script exists

Implementation style:
- Preserve a premium dark-mode-friendly UI.
- Use reusable components for dashboards, forms, cards, tables, modals, editors, uploaders, and report viewers.
- Validate server inputs with Zod.
- Keep AI outputs JSON-safe with fallback parsing.
- Add deterministic demo/seed behavior where useful.
- Do not stop at a plan. Implement the app, run verification, and report changed files.`;
}

function createAppPages(winner: ScoredProductIdea) {
  return [
    {
      route: "/dashboard",
      purpose: `Show saved ${winner.title} projects, recent AI outputs, and quick-start actions.`,
      components: ["DashboardHeader", "StatsCards", "ProjectsTable", "RecentOutputs"],
      actions: ["Create project", "Open project", "Search/filter records"],
      data: ["projects", "generated_outputs", "workspace stats"],
    },
    {
      route: "/projects/new",
      purpose: "Collect the buyer inputs required to run the core workflow.",
      components: ["ProjectForm", "InputGuidancePanel", "TemplateSelector"],
      actions: ["Enter project data", "Choose template", "Save draft", "Run AI"],
      data: ["prompt_templates", "workspace settings", "source inputs"],
    },
    {
      route: "/projects/[id]",
      purpose: "Manage one project and view its status, source inputs, and generated outputs.",
      components: ["ProjectSummary", "SourceInputList", "OutputTimeline", "ActionBar"],
      actions: ["Edit project", "Run AI workflow", "Export output", "Archive project"],
      data: ["project", "source_inputs", "generated_outputs", "audit_events"],
    },
    {
      route: "/projects/[id]/generate",
      purpose: "Run and review the primary AI-assisted workflow.",
      components: ["GenerationWorkspace", "PromptPreview", "OutputEditor", "QualityChecklist"],
      actions: ["Submit inputs", "Generate", "Regenerate", "Save edited output"],
      data: ["project", "prompt_templates", "AI response", "quality checks"],
    },
    {
      route: "/projects/[id]/export",
      purpose: "Preview and export the finished buyer/client-facing artifact.",
      components: ["ReportViewer", "ExportToolbar", "SharePreview"],
      actions: ["Preview", "Copy markdown", "Export PDF-ready output", "Download JSON"],
      data: ["project", "generated_outputs", "brand_settings"],
    },
    {
      route: "/settings",
      purpose: "Customize prompts, branding, workspace defaults, and model settings.",
      components: ["PromptSettingsForm", "BrandSettingsForm", "ModelSettingsForm"],
      actions: ["Edit prompts", "Update brand", "Save settings", "Reset demo data"],
      data: ["prompt_templates", "brand_settings", "workspace"],
    },
    {
      route: "/docs",
      purpose: "Buyer-facing documentation for installing, customizing, and deploying the source code.",
      components: ["DocsNav", "MarkdownDocs", "SetupChecklist"],
      actions: ["Read setup guide", "Copy commands", "Follow deployment checklist"],
      data: ["static documentation", "environment variable list"],
    },
  ];
}

function createDatabaseTables(winner: ScoredProductIdea) {
  return [
    {
      name: "users",
      columns: ["id uuid primary key", "email text", "created_at timestamptz"],
      relationships: ["id references auth.users(id)"],
      indexes: ["users_email_idx on email"],
      rls: "Users can read/update their own profile.",
    },
    {
      name: "workspaces",
      columns: [
        "id uuid primary key",
        "owner_id uuid",
        "name text",
        "created_at timestamptz",
      ],
      relationships: ["owner_id references users(id)"],
      indexes: ["workspaces_owner_id_idx on owner_id"],
      rls: "Workspace owners and invited members can access workspace data.",
    },
    {
      name: "projects",
      columns: [
        "id uuid primary key",
        "workspace_id uuid",
        "title text",
        "status text",
        "metadata jsonb",
        "created_at timestamptz",
        "updated_at timestamptz",
      ],
      relationships: ["workspace_id references workspaces(id)"],
      indexes: ["projects_workspace_created_idx on workspace_id, created_at desc"],
      rls: "Users can manage projects in workspaces they belong to.",
    },
    {
      name: "source_inputs",
      columns: [
        "id uuid primary key",
        "project_id uuid",
        "input_type text",
        "content text",
        "file_path text nullable",
        "created_at timestamptz",
      ],
      relationships: ["project_id references projects(id) on delete cascade"],
      indexes: ["source_inputs_project_idx on project_id"],
      rls: "Input access follows project workspace membership.",
    },
    {
      name: "generated_outputs",
      columns: [
        "id uuid primary key",
        "project_id uuid",
        "output_type text",
        "content_markdown text",
        "structured_output jsonb",
        "model_provider text",
        "model_name text",
        "created_at timestamptz",
      ],
      relationships: ["project_id references projects(id) on delete cascade"],
      indexes: ["generated_outputs_project_created_idx on project_id, created_at desc"],
      rls: "Output access follows project workspace membership.",
    },
    {
      name: "prompt_templates",
      columns: [
        "id uuid primary key",
        "workspace_id uuid",
        "name text",
        "purpose text",
        "system_prompt text",
        "user_prompt_template text",
        "output_schema jsonb",
        "created_at timestamptz",
      ],
      relationships: ["workspace_id references workspaces(id)"],
      indexes: ["prompt_templates_workspace_idx on workspace_id"],
      rls: "Workspace members can read; owners/admins can update.",
    },
    {
      name: "brand_settings",
      columns: [
        "id uuid primary key",
        "workspace_id uuid unique",
        "logo_path text nullable",
        "primary_color text",
        "company_name text",
        "settings jsonb",
      ],
      relationships: ["workspace_id references workspaces(id)"],
      indexes: ["brand_settings_workspace_idx on workspace_id"],
      rls: "Workspace members can read; owners/admins can update.",
    },
    {
      name: "audit_events",
      columns: [
        "id uuid primary key",
        "workspace_id uuid",
        "project_id uuid nullable",
        "actor_id uuid",
        "event_name text",
        "metadata jsonb",
        "created_at timestamptz",
      ],
      relationships: [
        "workspace_id references workspaces(id)",
        "project_id references projects(id)",
        "actor_id references users(id)",
      ],
      indexes: ["audit_events_workspace_created_idx on workspace_id, created_at desc"],
      rls: "Workspace members can read audit history.",
    },
  ].map((table) => ({
    ...table,
    columns:
      table.name === "projects"
        ? [...table.columns, `product_type text default '${winner.title}'`]
        : table.columns,
  }));
}

function createApiRoutes(winner: ScoredProductIdea) {
  return [
    {
      name: "List projects",
      route: "/api/projects",
      method: "GET",
      input: "workspace id from session/context",
      output: "array of project summaries",
      logic: "Fetch projects for the authenticated workspace, ordered by update date.",
      errorHandling: "Return 401 when unauthenticated and 500 with safe message on query failure.",
    },
    {
      name: "Create project",
      route: "/api/projects",
      method: "POST",
      input: "title, metadata, initial source inputs",
      output: "created project",
      logic: `Create a ${winner.title} project, save initial inputs, and write audit event.`,
      errorHandling: "Validate with Zod; return 400 for invalid fields and 403 for workspace mismatch.",
    },
    {
      name: "Get project",
      route: "/api/projects/[id]",
      method: "GET",
      input: "project id",
      output: "project, inputs, generated outputs, settings",
      logic: "Load one project with related workflow data for the authenticated workspace.",
      errorHandling: "Return 404 if missing or not accessible.",
    },
    {
      name: "Update project",
      route: "/api/projects/[id]",
      method: "PATCH",
      input: "title, status, metadata, edited output",
      output: "updated project",
      logic: "Update project metadata or edited output and refresh updated_at.",
      errorHandling: "Return 400 for invalid payload and 409 for stale updates if versioning is added.",
    },
    {
      name: "Run AI workflow",
      route: "/api/projects/[id]/generate",
      method: "POST",
      input: "project id, selected prompt template, source input ids, generation options",
      output: "structured AI output and saved generated_outputs row",
      logic: "Build prompt from project inputs, call provider adapter, validate JSON, save markdown and structured output.",
      errorHandling: "Fallback to deterministic template if JSON parsing fails; return 502 for provider failure.",
    },
    {
      name: "Export output",
      route: "/api/projects/[id]/export",
      method: "POST",
      input: "project id, output id, format",
      output: "markdown/PDF-ready/export JSON payload",
      logic: "Render generated output with brand settings and return exportable content.",
      errorHandling: "Return 404 for missing output and 400 for unsupported format.",
    },
    {
      name: "Update settings",
      route: "/api/settings",
      method: "PATCH",
      input: "prompt templates, brand settings, model preferences",
      output: "updated settings",
      logic: "Persist workspace-level customization for prompts and branding.",
      errorHandling: "Validate prompt length/schema; return 403 for non-admin workspace members.",
    },
  ];
}

function createAIFeatures(winner: ScoredProductIdea) {
  return [
    {
      name: "Core workflow generator",
      promptPurpose: `Turn buyer inputs into the primary ${winner.title} output.`,
      inputs: ["project metadata", "source inputs", "selected prompt template", "brand settings"],
      outputFormat: "JSON object with summary, recommendations, markdown output, confidence notes, and next actions",
      fallback: "Generate a deterministic markdown output from saved inputs and show a retry option.",
      rules: [
        "Return valid JSON",
        "Avoid unsupported claims",
        "Preserve buyer-provided facts",
        "Include editable markdown",
      ],
    },
    {
      name: "Quality reviewer",
      promptPurpose: "Review the generated output for completeness, clarity, and demo readiness.",
      inputs: ["generated output", "project goal", "target buyer"],
      outputFormat: "JSON checklist with pass/fail items, issues, and suggested edits",
      fallback: "Use a static quality checklist when the model fails.",
      rules: [
        "Flag missing required sections",
        "Suggest concrete edits",
        "Do not invent data",
        "Keep feedback actionable",
      ],
    },
    {
      name: "Rewrite assistant",
      promptPurpose: "Rewrite selected output sections in a clearer or more buyer-specific tone.",
      inputs: ["selected text", "tone", "target buyer", "context"],
      outputFormat: "JSON with rewrittenText and changeSummary",
      fallback: "Return the original text with a clear failure notice.",
      rules: [
        "Preserve meaning",
        "Do not add unsupported facts",
        "Keep the output concise",
        "Make changes easy to review",
      ],
    },
  ];
}

function createUIComponents() {
  return [
    "Dashboard stat cards",
    "Project creation form",
    "Input uploader",
    "Template selector",
    "Generated output cards",
    "Editable markdown/report viewer",
    "Projects table with filters",
    "Settings forms",
    "Brand preview card",
    "AI generation status panel",
    "Quality checklist",
    "Export toolbar",
    "Confirmation modal",
    "Empty/loading/error states",
  ];
}

function inferSourceBuyerType(winner: ScoredProductIdea) {
  const text = `${winner.title} ${winner.targetBuyer} ${winner.description}`.toLowerCase();

  if (/agency|client|white-label|resell/.test(text)) {
    return "Agency owner or freelancer buying code to customize and resell to clients";
  }

  if (/developer|template|starter|dashboard/.test(text)) {
    return "Developer buying source code to save implementation time";
  }

  return "Technical founder buying a complete implementation shortcut";
}

function createBuildPlan(run: CouncilRunInput) {
  return (run.buildTimeLimit ?? "").includes("14")
    ? [
        {
          day: "Day 1-2",
          focus: "Foundation",
          deliverable: "Next.js app, Supabase schema, auth, dashboard shell",
        },
        {
          day: "Day 3-5",
          focus: "Core workflow",
          deliverable: "Primary AI workflow, saved outputs, prompt templates",
        },
        {
          day: "Day 6-8",
          focus: "Buyer-facing polish",
          deliverable: "Responsive UI, seed scenario, empty/loading/error states",
        },
        {
          day: "Day 9-11",
          focus: "Exports and customization",
          deliverable: "Export flow, brand settings, prompt customization docs",
        },
        {
          day: "Day 12-14",
          focus: "Packaging and launch",
          deliverable: "README, demo video, LinkedIn post, sales DM kit",
        },
      ]
    : [
        {
          day: "Day 1",
          focus: "Foundation",
          deliverable: "Repo, auth, database, app shell, seed data",
        },
        {
          day: "Day 2",
          focus: "Core workflow",
          deliverable: "Main AI workflow and saved output model",
        },
        {
          day: "Day 3",
          focus: "Admin and buyer views",
          deliverable: "Dashboard, detail pages, output editor",
        },
        {
          day: "Day 4",
          focus: "Exports and polish",
          deliverable: "Export route, responsive UI, error states",
        },
        {
          day: "Day 5",
          focus: "Customization",
          deliverable: "Prompt settings, white-label hooks, docs",
        },
        {
          day: "Day 6",
          focus: "Demo assets",
          deliverable: "Seed scenario, demo script, screenshots",
        },
        {
          day: "Day 7",
          focus: "Launch",
          deliverable: "Final QA, packaging checklist, LinkedIn launch kit",
        },
      ];
}

function createPricingTiers(winner: ScoredProductIdea) {
  return {
    lite: "$149 - single-project source license, setup guide, schema, and core prompts",
    pro: `$299 - commercial source license, customization guide, seed data, and demo assets for ${winner.title}`,
    agency:
      "$599 - client-use license, white-label rights, prompt library, and resale-ready packaging notes",
  };
}

function createRejectedLosses(winner: ScoredProductIdea, context: ReportContext) {
  const explicitLosses = context.whyOthersLost ?? [];
  const rejected = (context.rejectedIdeas ?? []).slice(0, 8).map((idea) => ({
    title: idea.title,
    reason: idea.reason,
  }));
  const scoredLosses = (context.scoredIdeas ?? [])
    .filter((idea) => idea.title !== winner.title)
    .map((idea) => ({
      title: idea.title,
      reason:
        idea.lostReason ??
        `Scored ${idea.score.total_score}/100, below ${winner.title} on the combined council rubric.`,
    }));

  return uniqueByTitle([...explicitLosses, ...scoredLosses, ...rejected]).slice(0, 12);
}

function createMarketEvidenceAnalysis(
  winner: ScoredProductIdea,
  evidence: MarketEvidenceDraft[],
) {
  const strongestEvidence = [...evidence]
    .sort((a, b) => b.strengthScore - a.strengthScore)
    .slice(0, 5);
  const hasWinnerEvidence = evidence.some((item) => {
    const text = `${item.title} ${item.content}`.toLowerCase();
    return winner.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3)
      .some((word) => text.includes(word));
  });
  const hasPricingEvidence = evidence.some((item) =>
    ["willingness_to_pay", "pricing_signal"].includes(item.signalType),
  );
  const hasLinkedInEvidence = evidence.some(
    (item) => item.sourceType === "linkedin" || item.signalType === "buyer_comment",
  );
  const hasCompetitorEvidence = evidence.some(
    (item) =>
      item.sourceType === "competitor" || item.signalType === "competitor_weakness",
  );

  return {
    strongestEvidence,
    weakestAssumptions: [
      hasWinnerEvidence
        ? "The winner has at least some related evidence, but the exact offer still needs manual validation."
        : `No evidence directly names ${winner.title}; the council is extrapolating from adjacent pain.`,
      hasPricingEvidence
        ? "There is some pricing or willingness-to-pay signal, but package price still needs testing."
        : "No direct willingness-to-pay evidence was provided.",
      hasLinkedInEvidence
        ? "There is a LinkedIn-style signal, but Ahmad still needs to test the actual post hook."
        : "No LinkedIn comment or demo-hook evidence was provided.",
    ],
    evidenceGaps: [
      hasCompetitorEvidence
        ? "Competitor weakness exists, but Ahmad should confirm buyers prefer source-code ownership."
        : "Competitor weakness is not proven yet.",
      "Exact buyer segment and niche language still need validation.",
      "The final source-code package price should be tested with real DMs.",
      "Ahmad should verify that the demo hook earns comments from his actual audience.",
    ],
    manualVerification: [
      `Search LinkedIn for posts where ${winner.targetBuyer.toLowerCase()} complain about this workflow.`,
      "Ask 5-10 likely buyers whether owning the source code matters more than using a hosted tool.",
      "Post a lightweight mock/demo and watch for comments that ask for code, price, or access.",
      "DM interested commenters and ask whether they would pay for Lite, Pro, or Agency license terms.",
      "Compare at least 3 competitors and note what they do not offer to source-code buyers.",
    ],
  };
}

function createLinkedInSearches(winner: ScoredProductIdea) {
  return [
    `"${winner.targetBuyer}" "client portal" "weekly update"`,
    `"${winner.targetBuyer}" "AI tool" "source code"`,
    `"agency owner" "I need" "${winner.pain.split(" ").slice(0, 5).join(" ")}"`,
    `"Next.js" "Supabase" "starter kit" "agency"`,
    `"comment code" "AI" "${winner.title.split(" ").slice(0, 3).join(" ")}"`,
  ];
}

function createBuyerQuestions(winner: ScoredProductIdea) {
  return [
    `Would ${winner.title} save you enough implementation time to buy the source code?`,
    "What part would you customize first for your business or clients?",
    "Would you prefer a hosted tool, or do you specifically want code ownership?",
    "What price would feel fair for Lite, Pro, and Agency licenses?",
    "What proof would you need in a demo before buying?",
  ];
}

function createPositiveValidationSignals(winner: ScoredProductIdea) {
  return [
    `"Can you send me the code/package?"`,
    `"What is the price?"`,
    `"I could use this for a client."`,
    `"Does it include Supabase schema/prompts/docs?"`,
    `"I would buy this if it handles ${winner.mvpFeatures[0] ?? "the core workflow"}."`,
  ];
}

function createDemoHook(winner: ScoredProductIdea) {
  return `Start with ${winner.pain.toLowerCase()}, paste messy buyer input, generate the finished workflow artifact, then open the repo/docs to show buyers get the full source code.`;
}

function createLinkedInPost(winner: ScoredProductIdea, demoHook: string) {
  return `I built a full-source-code product package for ${winner.targetBuyer}.

Product: ${winner.title}

The pain:
${winner.pain}

The demo:
${demoHook}

The buyer does not get another subscription.
They get the codebase, prompts, schema, setup docs, seed data, and a path to customize it for their own business or clients.

Build this first.

Comment "code" if you want the walkthrough.`;
}

function createDMScript(winner: ScoredProductIdea) {
  return `Hey, I saw you build or sell tools for ${winner.targetBuyer.toLowerCase()}.

I am packaging ${winner.title} as a complete source-code product: Next.js, Supabase, AI prompts, schema, docs, and demo data.

It is built for teams who want to customize and launch faster instead of starting from scratch.

Want me to send the demo and package details?`;
}

function createDemoScript(winner: ScoredProductIdea, demoHook: string) {
  return `1. Open with the pain: ${winner.pain}
2. Show the demo hook: ${demoHook}
3. Run the core AI workflow live.
4. Show the generated output and customization points.
5. Open the database/schema and code structure briefly.
6. Show the packaging folder: docs, env example, seed data, prompts, license notes.
7. End with the buyer promise: customize this in hours, not weeks.`;
}

function uniqueByTitle<T extends { title: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.title)) {
      return false;
    }
    seen.add(item.title);
    return true;
  });
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.filter((item) => item.trim().length > 0))];
}
