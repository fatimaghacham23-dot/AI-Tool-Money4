export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type CouncilRunStatus = "draft" | "running" | "completed" | "failed";
export type ProductIdeaStatus =
  | "generated"
  | "rejected"
  | "shortlisted"
  | "winner"
  | "backup";
export type ProductFactoryStatus =
  | "generated"
  | "shortlisted"
  | "winner"
  | "validating"
  | "building"
  | "packaged"
  | "launched"
  | "sold"
  | "rejected"
  | "watchlist";
export type ExecutionPlanStatus =
  | "not_started"
  | "validating"
  | "building"
  | "packaging"
  | "launching"
  | "completed"
  | "paused";
export type ExecutionTaskStatus = "todo" | "doing" | "done" | "skipped";
export type ExecutionTaskPriority = "high" | "medium" | "low";
export type FinalDecision = "build_now" | "validate_first" | "reject_all";

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      agents: {
        Row: AgentRow;
        Insert: AgentInsert;
        Update: Partial<AgentInsert>;
        Relationships: [];
      };
      council_runs: {
        Row: CouncilRunRow;
        Insert: CouncilRunInsert;
        Update: Partial<CouncilRunInsert>;
        Relationships: [];
      };
      debate_rounds: {
        Row: DebateRoundRow;
        Insert: DebateRoundInsert;
        Update: Partial<DebateRoundInsert>;
        Relationships: [];
      };
      agent_messages: {
        Row: AgentMessageRow;
        Insert: AgentMessageInsert;
        Update: Partial<AgentMessageInsert>;
        Relationships: [];
      };
      product_ideas: {
        Row: ProductIdeaRow;
        Insert: ProductIdeaInsert;
        Update: Partial<ProductIdeaInsert>;
        Relationships: [];
      };
      product_scores: {
        Row: ProductScoreRow;
        Insert: ProductScoreInsert;
        Update: Partial<ProductScoreInsert>;
        Relationships: [];
      };
      market_evidence: {
        Row: MarketEvidenceRow;
        Insert: MarketEvidenceInsert;
        Update: Partial<MarketEvidenceInsert>;
        Relationships: [];
      };
      final_reports: {
        Row: FinalReportRow;
        Insert: FinalReportInsert;
        Update: Partial<FinalReportInsert>;
        Relationships: [];
      };
      execution_plans: {
        Row: ExecutionPlanRow;
        Insert: ExecutionPlanInsert;
        Update: Partial<ExecutionPlanInsert>;
        Relationships: [];
      };
      execution_tasks: {
        Row: ExecutionTaskRow;
        Insert: ExecutionTaskInsert;
        Update: Partial<ExecutionTaskInsert>;
        Relationships: [];
      };
      sales_assets: {
        Row: SalesAssetRow;
        Insert: SalesAssetInsert;
        Update: Partial<SalesAssetInsert>;
        Relationships: [];
      };
      package_plans: {
        Row: PackagePlanRow;
        Insert: PackagePlanInsert;
        Update: Partial<PackagePlanInsert>;
        Relationships: [];
      };

    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      council_run_status: CouncilRunStatus;
      product_idea_status: ProductIdeaStatus;
      product_factory_status: ProductFactoryStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type AgentRow = {
  id: string;
  name: string;
  role: string;
  system_prompt: string;
  model_provider: string;
  model_name: string;
  enabled: boolean;
  created_at: string;
};

export type AgentInsert = {
  id?: string;
  name: string;
  role: string;
  system_prompt: string;
  model_provider?: string;
  model_name?: string;
  enabled?: boolean;
  created_at?: string;
};

export type CouncilRunRow = {
  id: string;
  user_id: string;
  title: string;
  goal: string;
  target_buyer: string | null;
  product_category: string | null;
  build_time_limit: string | null;
  preferred_stack: string | null;
  minimum_price: number | null;
  linkedin_audience: string | null;
  notes: string | null;
  market_evidence_notes: string | null;
  status: CouncilRunStatus;
  winner_product_id: string | null;
  error_message: string | null;
  failed_step: string | null;
  failed_round: string | null;
  failed_agent: string | null;
  failed_provider: string | null;
  failed_model: string | null;
  debug_trace: Json | null;
  current_round: string | null;
  current_agent: string | null;
  current_step: string | null;
  current_provider: string | null;
  current_model: string | null;
  progress_percent: number | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CouncilRunInsert = {
  id?: string;
  user_id: string;
  title: string;
  goal: string;
  target_buyer?: string | null;
  product_category?: string | null;
  build_time_limit?: string | null;
  preferred_stack?: string | null;
  minimum_price?: number | null;
  linkedin_audience?: string | null;
  notes?: string | null;
  market_evidence_notes?: string | null;
  status?: CouncilRunStatus;
  winner_product_id?: string | null;
  error_message?: string | null;
  failed_step?: string | null;
  failed_round?: string | null;
  failed_agent?: string | null;
  failed_provider?: string | null;
  failed_model?: string | null;
  debug_trace?: Json | null;
  current_round?: string | null;
  current_agent?: string | null;
  current_step?: string | null;
  current_provider?: string | null;
  current_model?: string | null;
  progress_percent?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DebateRoundRow = {
  id: string;
  council_run_id: string;
  round_number: number;
  round_type: string;
  title: string;
  created_at: string;
};

export type DebateRoundInsert = {
  id?: string;
  council_run_id: string;
  round_number: number;
  round_type: string;
  title: string;
  created_at?: string;
};

export type AgentMessageRow = {
  id: string;
  council_run_id: string;
  debate_round_id: string;
  agent_id: string | null;
  model_provider: string | null;
  model_name: string | null;
  content: string;
  created_at: string;
};

export type AgentMessageInsert = {
  id?: string;
  council_run_id: string;
  debate_round_id: string;
  agent_id?: string | null;
  model_provider?: string | null;
  model_name?: string | null;
  content: string;
  created_at?: string;
};

export type ProductIdeaRow = {
  id: string;
  council_run_id: string;
  title: string;
  description: string;
  target_buyer: string | null;
  pain: string | null;
  why_buy_source_code: string | null;
  mvp_features: string[];
  full_features: string[];
  pricing_idea: string | null;
  risks: string[];
  status: ProductIdeaStatus;
  factory_status: ProductFactoryStatus;
  watchlisted: boolean;
  built_at: string | null;
  launched_at: string | null;
  sold_at: string | null;
  rejected_reason: string | null;
  notes: string | null;
  created_at: string;
};

export type ProductIdeaInsert = {
  id?: string;
  council_run_id: string;
  title: string;
  description: string;
  target_buyer?: string | null;
  pain?: string | null;
  why_buy_source_code?: string | null;
  mvp_features?: string[];
  full_features?: string[];
  pricing_idea?: string | null;
  risks?: string[];
  status?: ProductIdeaStatus;
  factory_status?: ProductFactoryStatus;
  watchlisted?: boolean;
  built_at?: string | null;
  launched_at?: string | null;
  sold_at?: string | null;
  rejected_reason?: string | null;
  notes?: string | null;
  created_at?: string;
};

export type ProductScoreRow = {
  id: string;
  product_idea_id: string;
  buyer_urgency: number;
  existing_purchase_behavior: number;
  linkedin_demo_strength: number;
  comment_dm_likelihood: number;
  actual_tool_gap: number;
  source_code_gap: number;
  manual_workaround_pain: number;
  hidden_workflow_specificity: number;
  price_believability: number;
  build_speed: number;
  total_score: number;
  score_explanations: Json;
};

export type ProductScoreInsert = {
  id?: string;
  product_idea_id: string;
  buyer_urgency: number;
  existing_purchase_behavior: number;
  linkedin_demo_strength: number;
  comment_dm_likelihood: number;
  actual_tool_gap: number;
  source_code_gap: number;
  manual_workaround_pain: number;
  hidden_workflow_specificity: number;
  price_believability: number;
  build_speed: number;
  total_score: number;
  score_explanations?: Json;
};

export type MarketEvidenceRow = {
  id: string;
  council_run_id: string;
  product_idea_id: string | null;
  source_type: string;
  source_name: string;
  source_url: string | null;
  title: string;
  content: string;
  signal_type: string;
  strength_score: number;
  created_at: string;
};

export type MarketEvidenceInsert = {
  id?: string;
  council_run_id: string;
  product_idea_id?: string | null;
  source_type: string;
  source_name: string;
  source_url?: string | null;
  title: string;
  content: string;
  signal_type: string;
  strength_score: number;
  created_at?: string;
};

export type FinalReportRow = {
  id: string;
  council_run_id: string;
  winner_product_id: string | null;
  final_decision: FinalDecision;
  day_one_sale_probability: number;
  report_markdown: string;
  linkedin_post: string;
  dm_script: string;
  demo_video_script: string;
  build_plan: Json;
  packaging_checklist: string[];
  pre_sell_pack: Json;
  created_at: string;
};

export type FinalReportInsert = {
  id?: string;
  council_run_id: string;
  winner_product_id?: string | null;
  final_decision?: FinalDecision;
  day_one_sale_probability?: number;
  report_markdown: string;
  linkedin_post: string;
  dm_script: string;
  demo_video_script: string;
  build_plan?: Json;
  packaging_checklist?: string[];
  pre_sell_pack?: Json;
  created_at?: string;
};

export type ExecutionPlanRow = {
  id: string;
  council_run_id: string;
  status: ExecutionPlanStatus;
  current_phase: string;
  progress_percent: number;
  created_at: string;
  updated_at: string;
};

export type ExecutionPlanInsert = {
  id?: string;
  council_run_id: string;
  status?: ExecutionPlanStatus;
  current_phase?: string;
  progress_percent?: number;
  created_at?: string;
  updated_at?: string;
};

export type ExecutionTaskRow = {
  id: string;
  execution_plan_id: string;
  phase: string;
  title: string;
  description: string;
  status: ExecutionTaskStatus;
  priority: ExecutionTaskPriority;
  due_day: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ExecutionTaskInsert = {
  id?: string;
  execution_plan_id: string;
  phase: string;
  title: string;
  description: string;
  status?: ExecutionTaskStatus;
  priority?: ExecutionTaskPriority;
  due_day: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type SalesAssetRow = {
  id: string;
  execution_plan_id: string;
  asset_type: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type SalesAssetInsert = {
  id?: string;
  execution_plan_id: string;
  asset_type: string;
  title: string;
  content: string;
  created_at?: string;
  updated_at?: string;
};

export type PackagePlanRow = {
  id: string;
  product_idea_id: string;
  package_markdown: string;
  readme_markdown: string;
  quickstart_markdown: string;
  license_markdown: string;
  sales_page_copy: string;
  demo_video_script: string;
  onboarding_email: string;
  created_at: string;
  updated_at: string;
};

export type PackagePlanInsert = {
  id?: string;
  product_idea_id: string;
  package_markdown: string;
  readme_markdown: string;
  quickstart_markdown: string;
  license_markdown: string;
  sales_page_copy: string;
  demo_video_script: string;
  onboarding_email: string;
  created_at?: string;
  updated_at?: string;
};
