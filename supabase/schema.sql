create extension if not exists pgcrypto;

do $$
begin
  create type public.council_run_status as enum ('draft', 'running', 'completed', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.product_idea_status as enum ('generated', 'rejected', 'shortlisted', 'winner', 'backup');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.product_factory_status as enum (
    'generated',
    'shortlisted',
    'winner',
    'validating',
    'building',
    'packaged',
    'launched',
    'sold',
    'rejected',
    'watchlist'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  role text not null,
  system_prompt text not null,
  model_provider text not null default 'github-models',
  model_name text not null default 'openai/gpt-4o-mini',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.council_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  goal text not null,
  target_buyer text,
  product_category text,
  build_time_limit text,
  preferred_stack text,
  minimum_price integer,
  linkedin_audience text,
  notes text,
  market_evidence_notes text,
  status public.council_run_status not null default 'draft',
  winner_product_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.council_runs
  add column if not exists market_evidence_notes text;

alter table public.council_runs
  add column if not exists error_message text,
  add column if not exists failed_step text,
  add column if not exists failed_round text,
  add column if not exists failed_agent text,
  add column if not exists failed_provider text,
  add column if not exists failed_model text,
  add column if not exists debug_trace jsonb,
  add column if not exists current_round text,
  add column if not exists current_agent text,
  add column if not exists current_step text,
  add column if not exists current_provider text,
  add column if not exists current_model text,
  add column if not exists progress_percent integer check (progress_percent between 0 and 100),
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists failed_at timestamptz;

create table if not exists public.debate_rounds (
  id uuid primary key default gen_random_uuid(),
  council_run_id uuid not null references public.council_runs(id) on delete cascade,
  round_number integer not null,
  round_type text not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (council_run_id, round_number)
);

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  council_run_id uuid not null references public.council_runs(id) on delete cascade,
  debate_round_id uuid not null references public.debate_rounds(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  model_provider text,
  model_name text,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.agent_messages
  add column if not exists model_provider text,
  add column if not exists model_name text;

create table if not exists public.product_ideas (
  id uuid primary key default gen_random_uuid(),
  council_run_id uuid not null references public.council_runs(id) on delete cascade,
  title text not null,
  description text not null,
  target_buyer text,
  pain text,
  why_buy_source_code text,
  mvp_features text[] not null default '{}',
  full_features text[] not null default '{}',
  pricing_idea text,
  risks text[] not null default '{}',
  status public.product_idea_status not null default 'generated',
  factory_status public.product_factory_status not null default 'generated',
  watchlisted boolean not null default false,
  built_at timestamptz,
  launched_at timestamptz,
  sold_at timestamptz,
  rejected_reason text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.product_ideas
  add column if not exists factory_status public.product_factory_status not null default 'generated',
  add column if not exists watchlisted boolean not null default false,
  add column if not exists built_at timestamptz,
  add column if not exists launched_at timestamptz,
  add column if not exists sold_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists notes text;

create table if not exists public.product_scores (
  id uuid primary key default gen_random_uuid(),
  product_idea_id uuid not null unique references public.product_ideas(id) on delete cascade,
  buyer_urgency integer not null default 0 check (buyer_urgency between 0 and 10),
  existing_purchase_behavior integer not null default 0 check (existing_purchase_behavior between 0 and 10),
  linkedin_demo_strength integer not null default 0 check (linkedin_demo_strength between 0 and 10),
  comment_dm_likelihood integer not null default 0 check (comment_dm_likelihood between 0 and 10),
  actual_tool_gap integer not null default 0 check (actual_tool_gap between 0 and 10),
  source_code_gap integer not null default 0 check (source_code_gap between 0 and 10),
  manual_workaround_pain integer not null default 0 check (manual_workaround_pain between 0 and 10),
  hidden_workflow_specificity integer not null default 0 check (hidden_workflow_specificity between 0 and 10),
  price_believability integer not null default 0 check (price_believability between 0 and 10),
  build_speed integer not null default 0 check (build_speed between 0 and 10),
  total_score integer not null check (total_score between 0 and 100),
  score_explanations jsonb not null default '{}'::jsonb
);

alter table public.product_scores
  add column if not exists buyer_urgency integer not null default 0 check (buyer_urgency between 0 and 10),
  add column if not exists existing_purchase_behavior integer not null default 0 check (existing_purchase_behavior between 0 and 10),
  add column if not exists linkedin_demo_strength integer not null default 0 check (linkedin_demo_strength between 0 and 10),
  add column if not exists comment_dm_likelihood integer not null default 0 check (comment_dm_likelihood between 0 and 10),
  add column if not exists actual_tool_gap integer not null default 0 check (actual_tool_gap between 0 and 10),
  add column if not exists source_code_gap integer not null default 0 check (source_code_gap between 0 and 10),
  add column if not exists manual_workaround_pain integer not null default 0 check (manual_workaround_pain between 0 and 10),
  add column if not exists hidden_workflow_specificity integer not null default 0 check (hidden_workflow_specificity between 0 and 10),
  add column if not exists price_believability integer not null default 0 check (price_believability between 0 and 10),
  add column if not exists build_speed integer not null default 0 check (build_speed between 0 and 10),
  add column if not exists total_score integer not null default 0 check (total_score between 0 and 100),
  add column if not exists score_explanations jsonb not null default '{}'::jsonb;

alter table public.product_scores
  drop constraint if exists product_scores_buyer_urgency_check,
  drop constraint if exists product_scores_existing_purchase_behavior_check,
  drop constraint if exists product_scores_linkedin_demo_strength_check,
  drop constraint if exists product_scores_comment_dm_likelihood_check,
  drop constraint if exists product_scores_actual_tool_gap_check,
  drop constraint if exists product_scores_source_code_gap_check,
  drop constraint if exists product_scores_manual_workaround_pain_check,
  drop constraint if exists product_scores_hidden_workflow_specificity_check,
  drop constraint if exists product_scores_price_believability_check,
  drop constraint if exists product_scores_build_speed_check,
  drop constraint if exists product_scores_total_score_check;

alter table public.product_scores
  add constraint product_scores_buyer_urgency_check check (buyer_urgency between 0 and 10),
  add constraint product_scores_existing_purchase_behavior_check check (existing_purchase_behavior between 0 and 10),
  add constraint product_scores_linkedin_demo_strength_check check (linkedin_demo_strength between 0 and 10),
  add constraint product_scores_comment_dm_likelihood_check check (comment_dm_likelihood between 0 and 10),
  add constraint product_scores_actual_tool_gap_check check (actual_tool_gap between 0 and 10),
  add constraint product_scores_source_code_gap_check check (source_code_gap between 0 and 10),
  add constraint product_scores_manual_workaround_pain_check check (manual_workaround_pain between 0 and 10),
  add constraint product_scores_hidden_workflow_specificity_check check (hidden_workflow_specificity between 0 and 10),
  add constraint product_scores_price_believability_check check (price_believability between 0 and 10),
  add constraint product_scores_build_speed_check check (build_speed between 0 and 10),
  add constraint product_scores_total_score_check check (total_score between 0 and 100);

do $$
declare
  legacy_column text;
begin
  foreach legacy_column in array array[
    'buyer_demand',
    'linkedin_virality',
    'demo_quality',
    'ai_value',
    'customization_potential',
    'price_potential',
    'ahmad_founder_fit'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'product_scores'
        and column_name = legacy_column
    ) then
      execute format('alter table public.product_scores alter column %I set default 1', legacy_column);
    end if;
  end loop;
end $$;

create table if not exists public.market_evidence (
  id uuid primary key default gen_random_uuid(),
  council_run_id uuid not null references public.council_runs(id) on delete cascade,
  product_idea_id uuid references public.product_ideas(id) on delete set null,
  source_type text not null default 'manual',
  source_name text not null default 'Manual observation',
  source_url text,
  title text not null,
  content text not null,
  signal_type text not null default 'demand',
  strength_score integer not null default 5 check (strength_score between 1 and 10),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'council_runs_winner_product_id_fkey'
  ) then
    alter table public.council_runs
      add constraint council_runs_winner_product_id_fkey
      foreign key (winner_product_id)
      references public.product_ideas(id)
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

create table if not exists public.market_search_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.council_runs(id) on delete cascade,
  product_idea_id uuid references public.product_ideas(id) on delete set null,
  idea_title text not null,
  query text not null,
  title text not null,
  url text not null,
  snippet text,
  source text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tool_existence_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.council_runs(id) on delete cascade,
  product_idea_id uuid references public.product_ideas(id) on delete set null,
  idea_title text not null,
  exact_tool_exists boolean not null default false,
  similar_tool_count integer not null default 0,
  similar_source_code_kit_count integer not null default 0,
  common_category_risk text not null default 'medium',
  actual_tool_gap_score integer not null default 5 check (actual_tool_gap_score between 0 and 10),
  source_code_gap_score integer not null default 5 check (source_code_gap_score between 0 and 10),
  confidence integer not null default 0 check (confidence between 0 and 100),
  notes text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.final_reports (
  id uuid primary key default gen_random_uuid(),
  council_run_id uuid not null unique references public.council_runs(id) on delete cascade,
  winner_product_id uuid references public.product_ideas(id) on delete set null,
  final_decision text not null default 'validate_first' check (
    final_decision in ('build_now', 'validate_first', 'reject_all')
  ),
  day_one_sale_probability integer not null default 0 check (day_one_sale_probability between 0 and 100),
  report_markdown text not null,
  linkedin_post text not null,
  dm_script text not null,
  demo_video_script text not null,
  build_plan jsonb not null default '[]'::jsonb,
  packaging_checklist text[] not null default '{}',
  pre_sell_pack jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.final_reports
  alter column winner_product_id drop not null,
  add column if not exists final_decision text not null default 'validate_first' check (
    final_decision in ('build_now', 'validate_first', 'reject_all')
  ),
  add column if not exists day_one_sale_probability integer not null default 0 check (day_one_sale_probability between 0 and 100),
  add column if not exists pre_sell_pack jsonb not null default '{}'::jsonb;

alter table public.final_reports
  drop constraint if exists final_reports_final_decision_check;

update public.final_reports
set final_decision = 'reject_all'
where final_decision = 'reject';

alter table public.final_reports
  add constraint final_reports_final_decision_check check (
    final_decision in ('build_now', 'validate_first', 'reject_all')
  );

create table if not exists public.execution_plans (
  id uuid primary key default gen_random_uuid(),
  council_run_id uuid not null unique references public.council_runs(id) on delete cascade,
  status text not null default 'not_started' check (
    status in ('not_started', 'validating', 'building', 'packaging', 'launching', 'completed', 'paused')
  ),
  current_phase text not null default 'Validation',
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.execution_tasks (
  id uuid primary key default gen_random_uuid(),
  execution_plan_id uuid not null references public.execution_plans(id) on delete cascade,
  phase text not null,
  title text not null,
  description text not null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done', 'skipped')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  due_day text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_assets (
  id uuid primary key default gen_random_uuid(),
  execution_plan_id uuid not null references public.execution_plans(id) on delete cascade,
  asset_type text not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists council_runs_user_created_idx on public.council_runs(user_id, created_at desc);
create index if not exists debate_rounds_run_number_idx on public.debate_rounds(council_run_id, round_number);
create index if not exists agent_messages_round_created_idx on public.agent_messages(debate_round_id, created_at);
create index if not exists product_ideas_run_status_idx on public.product_ideas(council_run_id, status);
create index if not exists product_ideas_factory_status_idx on public.product_ideas(factory_status, created_at desc);
create index if not exists product_ideas_watchlisted_idx on public.product_ideas(watchlisted, created_at desc);
create index if not exists product_scores_total_idx on public.product_scores(total_score desc);
create index if not exists market_evidence_run_idx on public.market_evidence(council_run_id, created_at desc);
create index if not exists market_evidence_product_idx on public.market_evidence(product_idea_id);
create index if not exists market_evidence_signal_idx on public.market_evidence(signal_type, strength_score desc);
create index if not exists market_search_results_run_idx on public.market_search_results(run_id, created_at desc);
create index if not exists market_search_results_idea_idx on public.market_search_results(product_idea_id);
create index if not exists tool_existence_checks_run_idx on public.tool_existence_checks(run_id, created_at desc);
create index if not exists tool_existence_checks_idea_idx on public.tool_existence_checks(product_idea_id);
create index if not exists execution_plans_run_idx on public.execution_plans(council_run_id);
create index if not exists execution_tasks_plan_sort_idx on public.execution_tasks(execution_plan_id, sort_order);
create index if not exists execution_tasks_status_idx on public.execution_tasks(execution_plan_id, status);
create index if not exists sales_assets_plan_type_idx on public.sales_assets(execution_plan_id, asset_type);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists council_runs_set_updated_at on public.council_runs;
create trigger council_runs_set_updated_at
before update on public.council_runs
for each row execute function public.set_updated_at();

drop trigger if exists execution_plans_set_updated_at on public.execution_plans;
create trigger execution_plans_set_updated_at
before update on public.execution_plans
for each row execute function public.set_updated_at();

drop trigger if exists execution_tasks_set_updated_at on public.execution_tasks;
create trigger execution_tasks_set_updated_at
before update on public.execution_tasks
for each row execute function public.set_updated_at();

drop trigger if exists sales_assets_set_updated_at on public.sales_assets;
create trigger sales_assets_set_updated_at
before update on public.sales_assets
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, 'unknown@example.com'))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.users enable row level security;
alter table public.council_runs enable row level security;
alter table public.agents enable row level security;
alter table public.debate_rounds enable row level security;
alter table public.agent_messages enable row level security;
alter table public.product_ideas enable row level security;
alter table public.product_scores enable row level security;
alter table public.market_evidence enable row level security;
alter table public.market_search_results enable row level security;
alter table public.tool_existence_checks enable row level security;
alter table public.final_reports enable row level security;
alter table public.execution_plans enable row level security;
alter table public.execution_tasks enable row level security;
alter table public.sales_assets enable row level security;

drop policy if exists "Users can read themselves" on public.users;
create policy "Users can read themselves"
on public.users for select
using (id = auth.uid());

drop policy if exists "Users can update themselves" on public.users;
create policy "Users can update themselves"
on public.users for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Users can insert themselves" on public.users;
create policy "Users can insert themselves"
on public.users for insert
with check (id = auth.uid());

drop policy if exists "Authenticated users can manage agents" on public.agents;
create policy "Authenticated users can manage agents"
on public.agents for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Users can manage their council runs" on public.council_runs;
create policy "Users can manage their council runs"
on public.council_runs for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can read their debate rounds" on public.debate_rounds;
create policy "Users can read their debate rounds"
on public.debate_rounds for select
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = debate_rounds.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their debate rounds" on public.debate_rounds;
create policy "Users can insert their debate rounds"
on public.debate_rounds for insert
with check (
  exists (
    select 1 from public.council_runs cr
    where cr.id = debate_rounds.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their debate rounds" on public.debate_rounds;
create policy "Users can delete their debate rounds"
on public.debate_rounds for delete
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = debate_rounds.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can read their agent messages" on public.agent_messages;
create policy "Users can read their agent messages"
on public.agent_messages for select
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = agent_messages.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their agent messages" on public.agent_messages;
create policy "Users can insert their agent messages"
on public.agent_messages for insert
with check (
  exists (
    select 1 from public.council_runs cr
    where cr.id = agent_messages.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their agent messages" on public.agent_messages;
create policy "Users can delete their agent messages"
on public.agent_messages for delete
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = agent_messages.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can read their product ideas" on public.product_ideas;
create policy "Users can read their product ideas"
on public.product_ideas for select
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = product_ideas.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their product ideas" on public.product_ideas;
create policy "Users can insert their product ideas"
on public.product_ideas for insert
with check (
  exists (
    select 1 from public.council_runs cr
    where cr.id = product_ideas.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can update their product ideas" on public.product_ideas;
create policy "Users can update their product ideas"
on public.product_ideas for update
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = product_ideas.council_run_id
      and cr.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.council_runs cr
    where cr.id = product_ideas.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their product ideas" on public.product_ideas;
create policy "Users can delete their product ideas"
on public.product_ideas for delete
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = product_ideas.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can read their product scores" on public.product_scores;
create policy "Users can read their product scores"
on public.product_scores for select
using (
  exists (
    select 1
    from public.product_ideas pi
    join public.council_runs cr on cr.id = pi.council_run_id
    where pi.id = product_scores.product_idea_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their product scores" on public.product_scores;
create policy "Users can insert their product scores"
on public.product_scores for insert
with check (
  exists (
    select 1
    from public.product_ideas pi
    join public.council_runs cr on cr.id = pi.council_run_id
    where pi.id = product_scores.product_idea_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their product scores" on public.product_scores;
create policy "Users can delete their product scores"
on public.product_scores for delete
using (
  exists (
    select 1
    from public.product_ideas pi
    join public.council_runs cr on cr.id = pi.council_run_id
    where pi.id = product_scores.product_idea_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can read their market evidence" on public.market_evidence;
create policy "Users can read their market evidence"
on public.market_evidence for select
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = market_evidence.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their market evidence" on public.market_evidence;
create policy "Users can insert their market evidence"
on public.market_evidence for insert
with check (
  exists (
    select 1 from public.council_runs cr
    where cr.id = market_evidence.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can update their market evidence" on public.market_evidence;
create policy "Users can update their market evidence"
on public.market_evidence for update
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = market_evidence.council_run_id
      and cr.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.council_runs cr
    where cr.id = market_evidence.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their market evidence" on public.market_evidence;
create policy "Users can delete their market evidence"
on public.market_evidence for delete
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = market_evidence.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can read their market search results" on public.market_search_results;
create policy "Users can read their market search results"
on public.market_search_results for select
using (exists (select 1 from public.council_runs cr where cr.id = market_search_results.run_id and cr.user_id = auth.uid()));

create policy "Users can insert their market search results"
on public.market_search_results for insert
with check (exists (select 1 from public.council_runs cr where cr.id = market_search_results.run_id and cr.user_id = auth.uid()));

drop policy if exists "Users can read their tool existence checks" on public.tool_existence_checks;
create policy "Users can read their tool existence checks"
on public.tool_existence_checks for select
using (exists (select 1 from public.council_runs cr where cr.id = tool_existence_checks.run_id and cr.user_id = auth.uid()));

create policy "Users can insert their tool existence checks"
on public.tool_existence_checks for insert
with check (exists (select 1 from public.council_runs cr where cr.id = tool_existence_checks.run_id and cr.user_id = auth.uid()));

drop policy if exists "Users can read their final reports" on public.final_reports;
create policy "Users can read their final reports"
on public.final_reports for select
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = final_reports.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their final reports" on public.final_reports;
create policy "Users can insert their final reports"
on public.final_reports for insert
with check (
  exists (
    select 1 from public.council_runs cr
    where cr.id = final_reports.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their final reports" on public.final_reports;
create policy "Users can delete their final reports"
on public.final_reports for delete
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = final_reports.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can read their execution plans" on public.execution_plans;
create policy "Users can read their execution plans"
on public.execution_plans for select
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = execution_plans.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their execution plans" on public.execution_plans;
create policy "Users can insert their execution plans"
on public.execution_plans for insert
with check (
  exists (
    select 1 from public.council_runs cr
    where cr.id = execution_plans.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can update their execution plans" on public.execution_plans;
create policy "Users can update their execution plans"
on public.execution_plans for update
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = execution_plans.council_run_id
      and cr.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.council_runs cr
    where cr.id = execution_plans.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their execution plans" on public.execution_plans;
create policy "Users can delete their execution plans"
on public.execution_plans for delete
using (
  exists (
    select 1 from public.council_runs cr
    where cr.id = execution_plans.council_run_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can read their execution tasks" on public.execution_tasks;
create policy "Users can read their execution tasks"
on public.execution_tasks for select
using (
  exists (
    select 1
    from public.execution_plans ep
    join public.council_runs cr on cr.id = ep.council_run_id
    where ep.id = execution_tasks.execution_plan_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their execution tasks" on public.execution_tasks;
create policy "Users can insert their execution tasks"
on public.execution_tasks for insert
with check (
  exists (
    select 1
    from public.execution_plans ep
    join public.council_runs cr on cr.id = ep.council_run_id
    where ep.id = execution_tasks.execution_plan_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can update their execution tasks" on public.execution_tasks;
create policy "Users can update their execution tasks"
on public.execution_tasks for update
using (
  exists (
    select 1
    from public.execution_plans ep
    join public.council_runs cr on cr.id = ep.council_run_id
    where ep.id = execution_tasks.execution_plan_id
      and cr.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.execution_plans ep
    join public.council_runs cr on cr.id = ep.council_run_id
    where ep.id = execution_tasks.execution_plan_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their execution tasks" on public.execution_tasks;
create policy "Users can delete their execution tasks"
on public.execution_tasks for delete
using (
  exists (
    select 1
    from public.execution_plans ep
    join public.council_runs cr on cr.id = ep.council_run_id
    where ep.id = execution_tasks.execution_plan_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can read their sales assets" on public.sales_assets;
create policy "Users can read their sales assets"
on public.sales_assets for select
using (
  exists (
    select 1
    from public.execution_plans ep
    join public.council_runs cr on cr.id = ep.council_run_id
    where ep.id = sales_assets.execution_plan_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert their sales assets" on public.sales_assets;
create policy "Users can insert their sales assets"
on public.sales_assets for insert
with check (
  exists (
    select 1
    from public.execution_plans ep
    join public.council_runs cr on cr.id = ep.council_run_id
    where ep.id = sales_assets.execution_plan_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can update their sales assets" on public.sales_assets;
create policy "Users can update their sales assets"
on public.sales_assets for update
using (
  exists (
    select 1
    from public.execution_plans ep
    join public.council_runs cr on cr.id = ep.council_run_id
    where ep.id = sales_assets.execution_plan_id
      and cr.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.execution_plans ep
    join public.council_runs cr on cr.id = ep.council_run_id
    where ep.id = sales_assets.execution_plan_id
      and cr.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their sales assets" on public.sales_assets;
create policy "Users can delete their sales assets"
on public.sales_assets for delete
using (
  exists (
    select 1
    from public.execution_plans ep
    join public.council_runs cr on cr.id = ep.council_run_id
    where ep.id = sales_assets.execution_plan_id
      and cr.user_id = auth.uid()
  )
);

insert into public.agents (name, role, system_prompt, model_provider, model_name, enabled)
values
  (
    'Source Code Market Agent',
    'Finds source-code products people would want to buy.',
    'You identify practical full-source-code products that builders, agencies, and technical founders would buy to save weeks of work. Prefer products Ahmad can build in 7-14 days, demo clearly on LinkedIn, and sell as a complete code package.',
    'github-models',
    'openai/gpt-4o-mini',
    true
  ),
  (
    'LinkedIn Virality Agent',
    'Judges whether the product can sell from a LinkedIn post or demo.',
    'You evaluate whether a product can win attention on LinkedIn through a sharp demo, concrete before-and-after proof, and a buyer-aware launch post. Reject ideas that are useful but invisible.',
    'github-models',
    'openai/gpt-4o',
    true
  ),
  (
    'Developer Buyer Agent',
    'Thinks like a developer buying source code to save time.',
    'You are a pragmatic developer buyer. You pay for source code only when it saves real implementation time, is easy to customize, has clean architecture, and includes docs, seed data, and deployment notes.',
    'github-models',
    'openai/gpt-4.1',
    true
  ),
  (
    'Agency Buyer Agent',
    'Thinks like an agency owner buying code to customize or resell.',
    'You evaluate whether an agency could adapt the product for multiple clients, package it into services, and recover the purchase price quickly. Favor white-label, client-facing, and repeatable business tools.',
    'github-models',
    'openai/gpt-4o-mini',
    true
  ),
  (
    'Skeptic Agent',
    'Attacks weak ideas and rejects fantasy thinking.',
    'You are the hard-nosed skeptic. Attack assumptions, fake demand, vague AI value, crowded categories, slow builds, weak demos, and low willingness to pay. Be direct but constructive.',
    'github-models',
    'openai/gpt-4o-mini',
    true
  ),
  (
    'Builder Agent',
    'Turns product ideas into realistic technical specs.',
    'You turn promising ideas into buildable technical plans. You care about scope control, database shape, API routes, UI pages, and what can actually ship in 7-14 days.',
    'github-models',
    'openai/gpt-4.1',
    true
  ),
  (
    'Pricing Agent',
    'Decides price tiers, licenses, and packaging.',
    'You price complete source-code products. Think in founder license, agency license, resale limits, documentation quality, bonuses, and what makes a buyer feel the package is worth paying for.',
    'github-models',
    'openai/gpt-4.1-nano',
    true
  ),
  (
    'Judge Agent',
    'Applies the Day-One Sale Probability build gate.',
    'You are the final judge. Treat total_score as Day-One Sale Probability. Do not choose generic existing products. Enforce actual_tool_gap >= 7, hidden_workflow_specificity >= 7, and manual_workaround_pain >= 7 before an idea can even be validated. Choose "Build now" only when the selected product scores 85+ with strong buyer urgency and LinkedIn demo strength. If at least one idea clears the hidden-gap gates but is not build-ready, say "Validate first / Do not build yet" and do not select a winner. If all ideas fail actual_tool_gap or hidden_workflow_specificity, choose reject_all, do not invent a winner, do not validate weak generic ideas, and say clearly: "Reject all. Generate better hidden-gap ideas or add stronger market evidence."',
    'github-models',
    'openai/gpt-4.1',
    true
  )
on conflict (name) do update set
  role = excluded.role,
  system_prompt = excluded.system_prompt,
  model_provider = excluded.model_provider,
  model_name = excluded.model_name,
  enabled = excluded.enabled;


create table if not exists package_plans (
  id uuid primary key default gen_random_uuid(),
  product_idea_id uuid not null references product_ideas(id) on delete cascade,
  package_markdown text not null default '',
  readme_markdown text not null default '',
  quickstart_markdown text not null default '',
  license_markdown text not null default '',
  sales_page_copy text not null default '',
  demo_video_script text not null default '',
  onboarding_email text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(product_idea_id)
);
