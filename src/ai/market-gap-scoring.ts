import type { ProductIdeaDraft, ProductScore } from "@/ai/types";
import { normalizeScore } from "@/ai/scoring";
import type {
  MarketEvidence,
  MarketSearchProvider,
  MarketSearchResult,
  ToolExistenceCheck,
} from "@/lib/market-search/types";

const SOURCE_CODE_TERMS = /github|source code|template|boilerplate|starter kit|repo|repository|codecanyon|vercel template/i;
const TOOL_TERMS = /software|saas|tool|app|platform|tracker|detector|automation|dashboard|alternative/i;
const MARKETPLACE_TERMS = /g2|capterra|product hunt|alternativeto|saasworthy|getapp|toolify|futurepedia/i;

export function generateMarketSearchQueries(idea: ProductIdeaDraft) {
  const title = idea.title.trim();
  const problemPhrase = firstMeaningfulPhrase(idea.pain || idea.description);
  const workaroundPhrase = firstMeaningfulPhrase(
    `${idea.pain} ${idea.description}`.replace(/\b(ai|automated|automatic)\b/gi, "manual"),
  );

  return uniqueStrings([
    `${title} software`,
    `${title} SaaS`,
    `${title} AI tool`,
    `${title} app`,
    `${title} alternative`,
    `${title} GitHub`,
    `${title} source code`,
    `${title} template`,
    `${title} boilerplate`,
    problemPhrase ? `${problemPhrase} tool` : "",
    workaroundPhrase ? `${workaroundPhrase} software` : "",
  ]).slice(0, 11);
}

export async function runMarketExistenceCheck(
  idea: ProductIdeaDraft,
  provider: MarketSearchProvider,
): Promise<ToolExistenceCheck> {
  const queries = generateMarketSearchQueries(idea);
  const evidence: MarketEvidence[] = [];

  try {
    for (const query of queries) {
      const results = await provider.search(query, { limit: 5 });
      const usefulResults = results.filter((result) => !isManualFallbackResult(result));
      const similarTools = usefulResults.filter(isLikelyToolResult);
      const sourceCodeKits = usefulResults.filter(isLikelySourceCodeResult);
      evidence.push({
        ideaTitle: idea.title,
        query,
        results,
        competitorCount: similarTools.length,
        similarToolCount: similarTools.length,
        sourceCodeKitCount: sourceCodeKits.length,
        notes: usefulResults.length
          ? "Searched market results; counts are heuristic and should be treated as searched-result evidence, not proof of non-existence."
          : "No configured web-search evidence for this query; do not infer a high market gap from absence alone.",
        evidenceStrength: usefulResults.length ? Math.min(10, 4 + usefulResults.length) : 1,
      });
    }
  } catch (error) {
    return failedExistenceCheck(idea, queries, error);
  }

  return buildExistenceCheck(idea, evidence, provider.name);
}

export function applyMarketGapRules(
  idea: ProductIdeaDraft,
  score: ProductScore,
  check?: ToolExistenceCheck,
): ProductScore {
  if (!check) {
    return normalizeScore({
      ...score,
      actual_tool_gap: Math.min(score.actual_tool_gap, 5),
      source_code_gap: Math.min(score.source_code_gap, 5),
    });
  }

  let actualToolGap = Math.min(score.actual_tool_gap, check.actualToolGapScore);
  let sourceCodeGap = Math.min(score.source_code_gap, check.sourceCodeGapScore);

  if (check.exactToolExists && check.similarSaaSTools.length >= 3) {
    actualToolGap = Math.min(actualToolGap, 6);
  }

  if (check.similarSourceCodeKits.length >= 2) {
    sourceCodeGap = Math.min(sourceCodeGap, 6);
  }

  if (check.commonCategoryRisk === "high") {
    actualToolGap = Math.min(actualToolGap, 6);
  }

  if (check.confidence < 50 || check.marketSearchStatus !== "completed") {
    actualToolGap = Math.min(actualToolGap, 6);
    sourceCodeGap = Math.min(sourceCodeGap, 6);
  }

  return normalizeScore({
    ...score,
    productIdeaId: idea.id,
    actual_tool_gap: actualToolGap,
    source_code_gap: sourceCodeGap,
  });
}

export function canBuildNowWithMarketEvidence(score: ProductScore, check?: ToolExistenceCheck) {
  return Boolean(
    check &&
      check.marketSearchStatus === "completed" &&
      check.confidence >= 50 &&
      !check.exactToolExists &&
      check.commonCategoryRisk !== "high" &&
      score.total_score >= 85 &&
      score.actual_tool_gap >= 7 &&
      score.source_code_gap >= 7 &&
      score.hidden_workflow_specificity >= 7 &&
      score.manual_workaround_pain >= 7,
  );
}

function buildExistenceCheck(
  idea: ProductIdeaDraft,
  evidence: MarketEvidence[],
  providerName: string,
): ToolExistenceCheck {
  const allResults = evidence.flatMap((item) => item.results).filter((result) => !isManualFallbackResult(result));
  const similarSaaSTools = uniqueByUrl(allResults.filter(isLikelyToolResult));
  const similarSourceCodeKits = uniqueByUrl(allResults.filter(isLikelySourceCodeResult));
  const exactToolExists = similarSaaSTools.some((result) => hasTitleTokenOverlap(idea.title, result.title, 0.75));
  const commonCategoryRisk = inferCommonCategoryRisk(similarSaaSTools.length, similarSourceCodeKits.length, allResults);
  const confidence = providerName === "manual-fallback" ? 20 : Math.min(95, 45 + Math.min(40, allResults.length * 3));

  return {
    ideaTitle: idea.title,
    exactToolExists,
    similarSaaSTools,
    similarSourceCodeKits,
    commonCategoryRisk,
    actualToolGapScore: scoreActualToolGap(exactToolExists, similarSaaSTools.length, commonCategoryRisk, confidence),
    sourceCodeGapScore: scoreSourceCodeGap(similarSourceCodeKits.length, confidence),
    confidence,
    evidence,
    notes:
      providerName === "manual-fallback"
        ? "No web-search API is configured. This is not enough evidence for build_now; use validate_first or reject_all."
        : "Scores are based on searched market evidence. Use 'not found in searched market evidence', never 'does not exist'.",
    marketSearchStatus: "completed",
  };
}

function failedExistenceCheck(idea: ProductIdeaDraft, queries: string[], error: unknown): ToolExistenceCheck {
  const message = error instanceof Error ? error.message : "Unknown market search failure";
  return {
    ideaTitle: idea.title,
    exactToolExists: false,
    similarSaaSTools: [],
    similarSourceCodeKits: [],
    commonCategoryRisk: "high",
    actualToolGapScore: 4,
    sourceCodeGapScore: 4,
    confidence: 0,
    evidence: queries.map((query) => ({
      ideaTitle: idea.title,
      query,
      results: [],
      competitorCount: 0,
      similarToolCount: 0,
      sourceCodeKitCount: 0,
      notes: `Market search failed: ${message}`,
      evidenceStrength: 0,
    })),
    notes: `Market search failed: ${message}. Do not allow build_now.`,
    marketSearchStatus: "failed",
  };
}

function scoreActualToolGap(exact: boolean, tools: number, risk: string, confidence: number) {
  if (confidence < 50) return 5;
  if (exact && tools >= 3) return 3;
  if (tools >= 8 || risk === "high") return 4;
  if (tools >= 3) return 6;
  if (tools >= 1) return 8;
  return 9;
}

function scoreSourceCodeGap(kits: number, confidence: number) {
  if (confidence < 50) return 5;
  if (kits >= 5) return 3;
  if (kits >= 2) return 6;
  if (kits >= 1) return 8;
  return 9;
}

function inferCommonCategoryRisk(tools: number, kits: number, results: MarketSearchResult[]) {
  const marketplaceHits = results.filter((result) => MARKETPLACE_TERMS.test(`${result.title} ${result.url}`)).length;
  if (tools >= 8 || kits >= 5 || marketplaceHits >= 3) return "high";
  if (tools >= 3 || kits >= 2 || marketplaceHits >= 1) return "medium";
  return "low";
}

function isLikelyToolResult(result: MarketSearchResult) {
  const text = `${result.title} ${result.url} ${result.snippet}`;
  return TOOL_TERMS.test(text) && !SOURCE_CODE_TERMS.test(text);
}

function isLikelySourceCodeResult(result: MarketSearchResult) {
  return SOURCE_CODE_TERMS.test(`${result.title} ${result.url} ${result.snippet}`);
}

function isManualFallbackResult(result: MarketSearchResult) {
  return result.url.startsWith("manual://") || result.source === "manual-fallback";
}

function hasTitleTokenOverlap(left: string, right: string, threshold: number) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return false;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / leftTokens.size >= threshold;
}

function tokenSet(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !["the", "for", "and", "with", "tool", "app"].includes(token)),
  );
}

function firstMeaningfulPhrase(text: string) {
  return text
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ")
    .trim();
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function uniqueByUrl(results: MarketSearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = result.url.replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
