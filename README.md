# Ahmad Product Council

Private Next.js platform for running structured AI agent debates that choose one full-source-code product for Ahmad to build, package, and sell on LinkedIn.

This is not a public SaaS. It is an internal decision engine for complete source-code products such as AI client portals, proposal generators, admin dashboards, agency-resellable templates, and business tools.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style local components
- Supabase Auth and PostgreSQL
- OpenAI for V1 agent simulation
- Provider abstraction ready for Anthropic, Gemini, Mistral, DeepSeek, Grok, and local models

## Core Flow

1. Open `/dashboard`.
2. Create a run at `/new-council`.
3. Enter the product-search goal and constraints.
4. The platform runs seven debate rounds:
   - Generate 20 full-source-code product ideas
   - Reject weak ideas
   - Keep the top 5
   - Debate the shortlist
   - Score every idea out of 100
   - Judge chooses one winner
   - Generate the final report
5. Review `/council/[id]/debate` and `/council/[id]/report`.
6. Open `/council/[id]/execution` to work through validation, build, packaging, and LinkedIn launch tasks for the winning product.

The Judge Agent must always choose one product and clearly say: "Build this first."

## Project Structure

```txt
src/
  ai/
    agents.ts
    debate-runner.ts
    execution-generator.ts
    report-generator.ts
    scoring.ts
  providers/
    index.ts
    openai.ts
    types.ts
  app/
    dashboard/
    new-council/
    council/[id]/
    settings/agents/
    api/
  components/
  lib/
    data/
    db/
    supabase/
supabase/
  schema.sql
```

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

If Supabase env vars are missing, the UI falls back to a deterministic demo run so you can inspect the product experience before connecting infrastructure.

## Environment Variables

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

`SUPABASE_SERVICE_ROLE_KEY` is included for future server-side admin tasks. The current app uses the authenticated server client for normal run creation and persistence.

## Supabase

1. Create a Supabase project.
2. Open the SQL editor.
3. Run `supabase/schema.sql`.
4. Enable email magic links in Supabase Auth.
5. Add the Supabase URL and anon key to `.env.local`.
6. Visit `/login` and sign in with your email.

The schema creates:

- `users`
- `council_runs`
- `agents`
- `debate_rounds`
- `agent_messages`
- `product_ideas`
- `product_scores`
- `market_evidence`
- `final_reports`
- `execution_plans`
- `execution_tasks`
- `sales_assets`

It also enables RLS policies and seeds the eight default council agents.

## AI Architecture

V1 uses `OpenAIProvider` in `src/providers/openai.ts`.

The debate runner depends on the generic `AIProvider` interface:

```ts
export interface AIProvider {
  name: AIProviderName;
  generateText(options: GenerateTextOptions): Promise<string>;
  generateJSON<T>(options: GenerateJSONOptions<T>): Promise<T>;
}
```

To add another model provider later:

1. Add a provider file in `src/providers/`.
2. Implement `generateText` and `generateJSON`.
3. Update `getAIProvider()` or add provider routing by agent.
4. Store provider/model choices in the `agents` table.

## Default Agents

- Source Code Market Agent
- LinkedIn Virality Agent
- Developer Buyer Agent
- Agency Buyer Agent
- Skeptic Agent
- Builder Agent
- Pricing Agent
- Judge Agent

Edit roles and prompts at `/settings/agents`.

## Key Files

- `supabase/schema.sql`: database tables, indexes, RLS, default agents
- `src/ai/debate-runner.ts`: seven-round council pipeline
- `src/ai/execution-generator.ts`: deterministic execution tasks and sales assets for the winner
- `src/ai/scoring.ts`: scoring rubric and score normalization
- `src/ai/report-generator.ts`: deterministic final-report fallback
- `src/providers/openai.ts`: OpenAI adapter
- `src/lib/data/execution.ts`: create/read/update execution plans
- `src/lib/db/debate-persistence.ts`: Supabase persistence adapter
- `src/app/api/council-runs/route.ts`: create and run a council
- `src/app/council/[id]/execution/page.tsx`: checklist-style execution pipeline UI

## Notes

- Payment features are intentionally absent.
- The product recommendation is for selling complete source code, not SaaS subscriptions.
- The local mock provider keeps the app previewable without `OPENAI_API_KEY`.
