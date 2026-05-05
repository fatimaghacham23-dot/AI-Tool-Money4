import type { CouncilAgent } from "@/ai/types";
import type {
  AgentMessageRow,
  CouncilRunRow,
  DebateRoundRow,
  FinalReportRow,
  MarketEvidenceRow,
  ProductIdeaRow,
  ProductScoreRow,
  ExecutionPlanRow,
  ExecutionTaskRow,
  SalesAssetRow,
  ProductFactoryStatus,
} from "@/types/database";

export type DashboardRun = {
  id: string;
  title: string;
  status: CouncilRunRow["status"];
  winnerProduct: string | null;
  totalScore: number | null;
  createdAt: string;
  evidenceCount: number;
};

export type DebateMessageView = AgentMessageRow & {
  agent: CouncilAgent | null;
};

export type DebateRoundView = DebateRoundRow & {
  messages: DebateMessageView[];
};

export type ProductIdeaView = ProductIdeaRow & {
  score: ProductScoreRow | null;
};

export type CouncilRunView = {
  run: CouncilRunRow;
  agents: CouncilAgent[];
  rounds: DebateRoundView[];
  ideas: ProductIdeaView[];
  marketEvidence: MarketEvidenceRow[];
  winner: ProductIdeaView | null;
  report: FinalReportRow | null;
};

export type ExecutionProgress = {
  totalTasks: number;
  completedTasks: number;
  progressPercent: number;
  currentPhase: string;
};

export type ExecutionPlanView = {
  plan: ExecutionPlanRow;
  tasks: ExecutionTaskRow[];
  salesAssets: SalesAssetRow[];
  progress: ExecutionProgress;
};

export type FactoryStatus = ProductFactoryStatus;

export type FactoryProductIdea = ProductIdeaView & {
  councilRun: Pick<
    CouncilRunRow,
    | "id"
    | "title"
    | "status"
    | "target_buyer"
    | "market_evidence_notes"
    | "created_at"
    | "winner_product_id"
  >;
  executionPlan: ExecutionPlanRow | null;
  finalReport: FinalReportRow | null;
  evidenceCount: number;
  evidenceStatus: "evidence_backed" | "run_evidence" | "needs_validation";
};

export type FactoryOverview = {
  totalIdeas: number;
  winnersSelected: number;
  productsInValidation: number;
  productsInBuild: number;
  productsReadyToSell: number;
  averageScore: number | null;
  highestScoringIdea: FactoryProductIdea | null;
};

export type FactoryFilters = {
  status?: FactoryStatus | "all";
  buyerType?: string;
  scoreRange?: "all" | "90-100" | "80-89" | "70-79" | "under-70";
  evidenceBackedOnly?: boolean;
  highLinkedInVirality?: boolean;
  fastBuildOnly?: boolean;
  highPricePotential?: boolean;
};

export type ProductFactoryDetail = {
  idea: FactoryProductIdea;
  marketEvidence: MarketEvidenceRow[];
  execution: ExecutionPlanView | null;
  salesAssets: SalesAssetRow[];
  codexPrompt: string | null;
};
