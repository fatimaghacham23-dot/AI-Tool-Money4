import type { AgentRow, ProductIdeaStatus } from "@/types/database";

export type AgentKey =
  | "source-code-market"
  | "linkedin-virality"
  | "developer-buyer"
  | "agency-buyer"
  | "skeptic"
  | "builder"
  | "pricing"
  | "judge";

export type CouncilAgent = {
  key: AgentKey;
  id?: string;
  name: string;
  role: string;
  systemPrompt: string;
  modelProvider: string;
  modelName: string;
  enabled: boolean;
  color: string;
  icon: string;
};

export type CouncilRunInput = {
  id?: string;
  userId?: string;
  title?: string;
  goal: string;
  targetBuyer?: string | null;
  productCategory?: string | null;
  buildTimeLimit?: string | null;
  preferredStack?: string | null;
  minimumPrice?: number | null;
  linkedinAudience?: string | null;
  notes?: string | null;
  marketEvidenceNotes?: string | null;
  marketEvidence?: MarketEvidenceDraft[];
};

export type MarketEvidenceDraft = {
  id?: string;
  councilRunId?: string;
  productIdeaId?: string | null;
  sourceType: string;
  sourceName: string;
  sourceUrl?: string | null;
  title: string;
  content: string;
  signalType: string;
  strengthScore: number;
  createdAt?: string;
};

export type ProductIdeaDraft = {
  id?: string;
  title: string;
  description: string;
  targetBuyer: string;
  pain: string;
  whyBuySourceCode: string;
  mvpFeatures: string[];
  fullFeatures: string[];
  pricingIdea: string;
  risks: string[];
  status?: ProductIdeaStatus;
};

export type ProductScore = {
  productIdeaId?: string;
  buyer_demand: number;
  linkedin_virality: number;
  source_code_resale_value: number;
  build_speed: number;
  demo_quality: number;
  ai_value: number;
  customization_potential: number;
  competition_weakness: number;
  price_potential: number;
  ahmad_founder_fit: number;
  total_score: number;
};

export type ProductScoreExplanations = {
  buyer_demand: string;
  linkedin_virality: string;
  source_code_resale_value: string;
  build_speed: string;
  demo_quality: string;
  ai_value: string;
  customization_potential: string;
  competition_weakness: string;
  price_potential: string;
  ahmad_founder_fit: string;
};

export type ScoredProductIdea = ProductIdeaDraft & {
  score: ProductScore;
  scoreReason?: string;
  scoreExplanations?: ProductScoreExplanations;
  lostReason?: string;
};

export type DebateRoundDraft = {
  roundNumber: number;
  roundType: string;
  title: string;
};

export type DebateMessageDraft = {
  roundId: string;
  agent: CouncilAgent;
  content: string;
};

export type FinalReportDraft = {
  winnerProductId?: string;
  reportMarkdown: string;
  linkedinPost: string;
  dmScript: string;
  demoVideoScript: string;
  buildPlan: Array<{ day: string; focus: string; deliverable: string }>;
  packagingChecklist: string[];
  codexBuildBlueprint?: string;
  codexPrompt?: string;
};

export type ExecutionTaskPhase =
  | "Validation"
  | "Build"
  | "Packaging"
  | "LinkedIn Launch";

export type ExecutionTaskDraft = {
  phase: ExecutionTaskPhase;
  title: string;
  description: string;
  status: "todo" | "doing" | "done" | "skipped";
  priority: "high" | "medium" | "low";
  dueDay: string;
  sortOrder: number;
};

export type SalesAssetDraft = {
  assetType:
    | "linkedin_launch_post"
    | "teaser_post"
    | "comment_reply"
    | "dm_script"
    | "follow_up_dm"
    | "pricing_message"
    | "license_explanation";
  title: string;
  content: string;
};

export type ExecutionPlanDraft = {
  status: "not_started" | "validating" | "building" | "packaging" | "launching";
  currentPhase: ExecutionTaskPhase;
  progressPercent: number;
  tasks: ExecutionTaskDraft[];
  salesAssets: SalesAssetDraft[];
};

export type DebateArtifacts = {
  run: CouncilRunInput;
  agents: CouncilAgent[];
  ideas: ProductIdeaDraft[];
  marketEvidence: MarketEvidenceDraft[];
  shortlistedIdeas: ProductIdeaDraft[];
  scoredIdeas: ScoredProductIdea[];
  winner: ScoredProductIdea;
  report: FinalReportDraft;
};

export interface DebatePersistence {
  markRunStatus?(status: "running" | "completed" | "failed"): Promise<void>;
  createRound(round: DebateRoundDraft): Promise<{ id: string }>;
  addMessage(message: DebateMessageDraft): Promise<void>;
  saveIdeas(ideas: ProductIdeaDraft[]): Promise<ProductIdeaDraft[]>;
  saveMarketEvidence?(evidence: MarketEvidenceDraft[]): Promise<MarketEvidenceDraft[]>;
  updateIdeaStatuses(
    updates: Array<{ id?: string; title: string; status: ProductIdeaStatus }>,
  ): Promise<void>;
  saveScores(scoredIdeas: ScoredProductIdea[]): Promise<void>;
  saveFinalReport(report: FinalReportDraft, winner: ScoredProductIdea): Promise<void>;
}

export type AgentRowLike = Pick<
  AgentRow,
  | "id"
  | "name"
  | "role"
  | "system_prompt"
  | "model_provider"
  | "model_name"
  | "enabled"
>;
