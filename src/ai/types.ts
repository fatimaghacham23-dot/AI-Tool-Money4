import type { AgentRow, ProductIdeaStatus } from "@/types/database";
import type { ToolExistenceCheck } from "@/lib/market-search/types";

export type AgentKey =
  | "source-code-market"
  | "linkedin-virality"
  | "market-research"
  | "buyer-intent"
  | "pre-sell"
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
  exactBuyer?: string;
  pain: string;
  whyBuySourceCode: string;
  sourceCodeOwnershipAngle?: string;
  manualWorkaroundToday?: string;
  messyInput?: string;
  outputArtifact?: string;
  painfulMoment?: string;
  broadSaasNotEnoughReason?: string;
  beforeAfterDemo?: string;
  initialSearchQueries?: string[];
  buildComplexity?: "low" | "medium" | "high" | string;
  fallbackGenerated?: boolean;
  nicheDownAttempts?: string[];
  genericRiskReason?: string;
  mvpFeatures: string[];
  fullFeatures: string[];
  pricingIdea: string;
  risks: string[];
  status?: ProductIdeaStatus;
};

export type ProductScore = {
  productIdeaId?: string;
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
};

export type ProductScoreExplanations = {
  buyer_urgency: string;
  existing_purchase_behavior: string;
  linkedin_demo_strength: string;
  comment_dm_likelihood: string;
  actual_tool_gap: string;
  source_code_gap: string;
  manual_workaround_pain: string;
  hidden_workflow_specificity: string;
  price_believability: string;
  build_speed: string;
};

export type ScoredProductIdea = ProductIdeaDraft & {
  score: ProductScore;
  scoreReason?: string;
  scoreExplanations?: ProductScoreExplanations;
  lostReason?: string;
};

export type FinalDecision = "build_now" | "validate_first" | "reject_all";

export type PreSellPack = {
  validationPost: string;
  teaserPost: string;
  dmReply: string;
  followUpDm: string;
  paymentLinkMessage: string;
  screenshotChecklist: string[];
  demoScript30s: string;
  goNoGoRule: string;
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
  provider?: string;
  model?: string;
};

export type FinalReportDraft = {
  winnerProductId?: string;
  finalDecision?: FinalDecision;
  dayOneSaleProbability?: number;
  reportMarkdown: string;
  linkedinPost: string;
  dmScript: string;
  demoVideoScript: string;
  buildPlan: Array<{ day: string; focus: string; deliverable: string }>;
  packagingChecklist: string[];
  preSellPack?: PreSellPack;
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
  toolExistenceChecks?: ToolExistenceCheck[];
  shortlistedIdeas: ProductIdeaDraft[];
  scoredIdeas: ScoredProductIdea[];
  winner: ScoredProductIdea;
  report: FinalReportDraft;
};

export interface DebatePersistence {
  markRunStatus?(status: "running" | "completed" | "failed"): Promise<void>;
  updateRunProgress?(progress: {
    currentRound?: string | null;
    currentAgent?: string | null;
    currentStep?: string | null;
    currentProvider?: string | null;
    currentModel?: string | null;
    progressPercent?: number | null;
  }): Promise<void>;
  createRound(round: DebateRoundDraft): Promise<{ id: string }>;
  addMessage(message: DebateMessageDraft): Promise<void>;
  saveIdeas(ideas: ProductIdeaDraft[]): Promise<ProductIdeaDraft[]>;
  saveMarketEvidence?(
    evidence: MarketEvidenceDraft[],
  ): Promise<MarketEvidenceDraft[]>;
  updateIdeaStatuses(
    updates: Array<{ id?: string; title: string; status: ProductIdeaStatus }>,
  ): Promise<void>;
  saveScores(scoredIdeas: ScoredProductIdea[]): Promise<void>;
  saveFinalReport(
    report: FinalReportDraft,
    winner: ScoredProductIdea,
  ): Promise<void>;
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
