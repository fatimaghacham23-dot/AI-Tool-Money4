export type MarketSearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  query: string;
  foundAt: string;
};

export type MarketEvidence = {
  ideaTitle: string;
  query: string;
  results: MarketSearchResult[];
  competitorCount: number;
  similarToolCount: number;
  sourceCodeKitCount: number;
  notes: string;
  evidenceStrength: number;
};

export type CommonCategoryRisk = "low" | "medium" | "high";

export type ToolExistenceCheck = {
  ideaTitle: string;
  exactToolExists: boolean;
  similarSaaSTools: MarketSearchResult[];
  similarSourceCodeKits: MarketSearchResult[];
  commonCategoryRisk: CommonCategoryRisk;
  actualToolGapScore: number;
  sourceCodeGapScore: number;
  confidence: number;
  evidence: MarketEvidence[];
  notes: string;
  marketSearchStatus: "completed" | "failed";
};

export type MarketSearchProvider = {
  name: string;
  search(query: string, options?: { limit?: number }): Promise<MarketSearchResult[]>;
};
