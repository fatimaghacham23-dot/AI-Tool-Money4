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

GITHUB_MODELS_TOKEN=
GITHUB_MODELS_BASE_URL=https://models.github.ai/inference
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


## Using GitHub Models

GitHub Models is the default multi-model provider for the council agents.

1. Create a GitHub personal access token.
2. Ensure the token has `models:read` permission.
3. Add the token and base URL to `.env.local`:

```env
GITHUB_MODELS_TOKEN=ghp_xxx
GITHUB_MODELS_BASE_URL=https://models.github.ai/inference
```

Supported model IDs:
- `openai/gpt-4o`
- `openai/gpt-4o-mini`
- `openai/gpt-4.1`
- `openai/gpt-4.1-nano`

Assign providers and models at `/settings/agents`. Store exact IDs above for each agent.

If `GITHUB_MODELS_TOKEN` is missing, the app logs a friendly warning and falls back to OpenAI when available, then mock/demo mode.

Quick test:

```bash
node scripts/test-github-models.mjs
```

## Debug GitHub Models 401

1. Open `/api/health/models?ts=123`.
2. Check `tokenPresent`, `tokenLength`, `tokenPrefix`, `tokenFingerprint`, `hasWhitespace`, and `hasQuotes`.
3. Check `rawFetchTest`.
4. If `rawFetchTest.status` is `401`, the token is invalid, expired, revoked, lacks `models:read`, or the GitHub account does not have GitHub Models access.
5. If `rawFetchTest.ok` is `true` but `sdkTest.ok` is `false`, the provider SDK configuration is wrong.
6. For fine-grained tokens, use Public repositories plus Models: Read if a repo-specific token does not show the Models permission.
7. A classic token can be used as a fallback if fine-grained token permissions are unavailable.
8. Restart the dev server after editing `.env.local`.

## Script Works But Health Returns 401

This usually means the Node script and Next.js dev server are using different or stale environment variables.

Kill all node processes:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

Or run:

```powershell
.\scripts\kill-node-dev.ps1
```

Start the app again from the project root:

```powershell
cd "D:\AI-Tool-Money2"
npm run dev
```

Compare `tokenFingerprint` from both checks:

```powershell
node scripts\test-github-models.mjs
```

Open:

```txt
http://localhost:3000/api/health/models?ts=123
```

If fingerprints differ, update `.env.local` and restart the dev server. If fingerprints match but the endpoint fails and the script succeeds, compare `finalUrl` and the raw fetch request body. If fingerprints match and both fail, the token or GitHub account access is invalid or lacks `models:read`.

## Debugging Failed Council Runs

When a council run fails, you can diagnose the issue using the built-in debug infrastructure:

1. Set the debug environment variable in `.env.local`:
   ```env
   DEBUG_COUNCIL_RUNS=true
   ```

2. Restart the development server:
   ```bash
   npm run dev
   ```

3. Test the model provider health:
   - Open http://localhost:3000/api/health/models
   - This tests GitHub Models connectivity and returns status/hints for common errors (401/403/404/429/500)

4. Create a council run and check the failure panel:
   - If the run fails, the council page shows:
     - Error message
     - Failed step (e.g., `model_call`, `parse_payload`, `insert_council_run`)
     - Failed round (e.g., "Round 1: Generate 20 Product Ideas")
     - Failed agent (e.g., "Source Code Market Agent")
     - Failed provider/model (e.g., "github-models / openai/gpt-4.1")
     - Expandable debug trace with full execution log
   - Check the server console for detailed `COUNCIL_RUN_FAILED` logs with trace data

5. Common failure patterns:
   - **401 Unauthorized**: GitHub Models token missing, expired, revoked, or lacks `models:read`
   - **403 Forbidden**: Token doesn't have access to GitHub Models or selected model
   - **404 Not Found**: Model ID may be unavailable or incorrect
   - **429 Rate Limit**: Rate limit or quota exceeded
   - **JSON Parse Errors**: Model returned invalid JSON; check debug trace for raw excerpt
