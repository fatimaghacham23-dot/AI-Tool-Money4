import type { ProductIdeaDraft, ProductScore } from "@/ai/types";
import {
  hasBadProductTitleQuality,
  isGenericProductTitle,
  normalizeProductTitle,
} from "@/ai/idea-quality";
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
const CONCRETE_WORKFLOW_NOUNS =
  /\b(approval|signoff|revision|feedback|scope|handoff|promise|contradiction|dispute|drift|proof|log|report|pack|builder|detector|resolver|extractor|spreadsheet|template|checklist|record|trail|figma|slack|loom|screenshot|email|doc|docs|notion|comment|change|source code|boilerplate|github)\b/i;

type MarketSearchQueryDebugEvent =
  | { step: "bad_search_query_dropped"; details: { query: string; reason: string; ideaTitle: string } }
  | { step: "clean_search_queries_created"; details: { ideaTitle: string; queries: string[] } };

type MarketSearchQueryDebug = (event: MarketSearchQueryDebugEvent) => void;

export function generateMarketSearchQueries(
  idea: ProductIdeaDraft,
  debug?: MarketSearchQueryDebug,
) {
  const title = normalizeProductTitle(idea.title, idea.targetBuyer);
  const titleCore = removeBuyerSuffix(title).toLowerCase();
  const painfulEvent = cleanManualPainForSearch(idea.painfulMoment || idea.pain || idea.description);
  const artifact = cleanWorkflowPhrase(idea.outputArtifact ?? titleCore);
  const messyInput = cleanWorkflowPhrase(idea.messyInput ?? "");
  const buyer = conciseSearchBuyer(idea.targetBuyer);
  const workaround = cleanManualPainForSearch(idea.manualWorkaroundToday ?? "");
  const titleArtifact = cleanWorkflowPhrase(titleCore);

  const rawQueries = [
    title,
    titleArtifact,
    artifact,
    combinePhrases(painfulEvent, artifact),
    painfulEvent.includes("client") ? painfulEvent : combinePhrases("client", painfulEvent),
    painfulEvent ? `track ${painfulEvent} manually` : "",
    buyer && artifact ? `${buyer} ${artifact} spreadsheet` : "",
    buyer && painfulEvent ? `${buyer} ${painfulEvent} spreadsheet` : "",
    messyInput && artifact ? `${messyInput} ${artifact}` : "",
    messyInput && painfulEvent ? `${messyInput} ${painfulEvent}` : "",
    workaround && artifact ? `${workaround} ${artifact}` : "",
    artifact ? `${artifact} template` : "",
    artifact ? `${artifact} spreadsheet` : "",
    painfulEvent ? `${painfulEvent} proof template` : "",
    titleArtifact ? `${titleArtifact} GitHub` : "",
    titleArtifact ? `${titleArtifact} boilerplate` : "",
    titleArtifact ? `${titleArtifact} source code` : "",
    ...ensureStringArray(idea.initialSearchQueries),
  ];

  const dropped: Array<{ query: string; reason: string }> = [];
  const cleaned = uniqueStrings(
    rawQueries.map((query) => sanitizeSearchQuery(query, idea.targetBuyer)),
  ).filter((query) => {
    const badReason = badSearchPhraseReason(query);
    if (badReason) {
      dropped.push({ query, reason: badReason });
      return false;
    }
    return true;
  });

  for (const item of dropped) {
    debug?.({
      step: "bad_search_query_dropped",
      details: { ...item, ideaTitle: title },
    });
  }

  const queries = cleaned.slice(0, 18);
  debug?.({
    step: "clean_search_queries_created",
    details: { ideaTitle: title, queries },
  });

  return queries;
}

function ensureStringArray(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export async function runMarketExistenceCheck(
  idea: ProductIdeaDraft,
  provider: MarketSearchProvider,
  debug?: MarketSearchQueryDebug,
): Promise<ToolExistenceCheck> {
  const queries = generateMarketSearchQueries(idea, debug);
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
  const isGeneric = isGenericProductTitle(idea.title);
  const titleQualityBad =
    hasBadProductTitleQuality(idea.title, idea.targetBuyer) ||
    idea.genericRiskReason === "title stuffed with broad buyer list";
  const missingWorkaround = !(idea.manualWorkaroundToday ?? "").trim();
  const missingInputs = !(idea.messyInput ?? "").trim();
  const missingArtifact = !(idea.outputArtifact ?? "").trim();
  const missingDemo = !(idea.beforeAfterDemo ?? "").trim();

  if (!check) {
    return normalizeScore({
      ...score,
      actual_tool_gap: Math.min(score.actual_tool_gap, 5),
      source_code_gap: Math.min(score.source_code_gap, 5),
      hidden_workflow_specificity: missingWorkaround
        ? Math.min(score.hidden_workflow_specificity, 5)
        : titleQualityBad
          ? Math.min(score.hidden_workflow_specificity, 5)
        : score.hidden_workflow_specificity,
      linkedin_demo_strength:
        missingInputs || missingArtifact || missingDemo || titleQualityBad
          ? Math.min(score.linkedin_demo_strength, 6)
          : score.linkedin_demo_strength,
    });
  }

  let actualToolGap = Math.min(score.actual_tool_gap, check.actualToolGapScore);
  let sourceCodeGap = Math.min(score.source_code_gap, check.sourceCodeGapScore);

  if (isGeneric) {
    actualToolGap = Math.min(actualToolGap, 4);
  }

  if (missingWorkaround) {
    // Hidden workflow specificity cannot be high if the workaround is vague/missing.
    score.hidden_workflow_specificity = Math.min(score.hidden_workflow_specificity, 5);
  }

  if (titleQualityBad) {
    score.hidden_workflow_specificity = Math.min(score.hidden_workflow_specificity, 5);
    score.linkedin_demo_strength = Math.min(score.linkedin_demo_strength, 6);
  }

  if (missingInputs || missingArtifact || missingDemo) {
    score.linkedin_demo_strength = Math.min(score.linkedin_demo_strength, 6);
  }

  if (check.exactToolExists) {
    actualToolGap = Math.min(actualToolGap, 3);
  } else if (check.similarSaaSTools.length >= 3) {
    actualToolGap = Math.min(actualToolGap, 6);
  }

  if (check.similarSourceCodeKits.length >= 2) {
    sourceCodeGap = Math.min(sourceCodeGap, 3);
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

export function isBadSearchPhrase(query: string) {
  return Boolean(badSearchPhraseReason(query));
}

export function cleanManualPainForSearch(value: string | undefined | null) {
  const lower = (value ?? "")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!lower) return "";

  const concepts: Array<[RegExp, string]> = [
    [/\b(proposal|proposals)\b.*\b(approval|approve|review|handoff|reuse|audit|evidence|proof)\b|\b(proposal|proposals)\b/i, "proposal review handoff"],
    [/\b(invoice|invoices)\b.*\b(unpaid|follow|payment|collections?|overdue)\b|\b(unpaid|overdue)\s+invoices?\b/i, "unpaid invoice followup log"],
    [/\b(spreadsheet|spreadsheets)\b.*\b(rebuild|rebuilding|copy|recurring|client)\b|\brebuilding\s+.*\bspreadsheet/i, "client spreadsheet rebuild audit"],
    [/\b(client portal|portal)\b.*\b(rebuild|handoff|approval|content|asset)\b/i, "client portal handoff checklist"],
    [/\b(approval|signoff)\b.*\b(reversal|reverses|contradict|dispute)\b/i, "approval reversal proof log"],
    [/\b(feedback|comments?)\b.*\b(drift|contradict|revision|scope)\b/i, "feedback drift report"],
    [/\b(scope)\b.*\b(promise|change|creep|resurface|late)\b/i, "scope promise change record"],
    [/\b(handoff)\b.*\b(assumption|gap|client|team)\b/i, "handoff assumption gap report"],
    [/\b(screenshot|screenshots?)\b.*\b(revision|markup|dispute|approval)\b/i, "screenshot revision dispute pack"],
    [/\b(loom|video)\b.*\b(feedback|revision|scope|approval)\b/i, "loom feedback scope report"],
  ];

  const match = concepts.find(([pattern]) => pattern.test(lower));
  if (match) return match[1];

  const cleaned = cleanWorkflowPhrase(lower);
  if (!CONCRETE_WORKFLOW_NOUNS.test(cleaned)) return "";
  if (hasVagueSentenceFragment(cleaned)) return "";
  return cleaned;
}

function badSearchPhraseReason(query: string) {
  const normalized = query.replace(/["']/g, "").replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  if (!lower) return "empty_query";
  if (lower.startsWith("they ")) return "starts_with_they";
  if (hasVagueSentenceFragment(lower)) return "vague_sentence_fragment";
  if (lower.includes("want an ai tool")) return "vague_ai_tool_fragment";
  if (lower.includes("need a modern starter")) return "vague_starter_fragment";
  if (/\b(is|are|was|were)\s+(repetitive|awkward)\b/i.test(lower)) return "vague_quality_sentence";
  if (/\bproof template\b/i.test(lower) && /\b(they|buyer|wants?|keep|keeps|is|are|faster path)\b/i.test(lower)) return "proof_template_vague_fragment";
  if (hasFullBuyerList(lower)) return "full_buyer_list";
  if (!CONCRETE_WORKFLOW_NOUNS.test(lower)) return "no_concrete_workflow_noun";

  const meaningful = meaningfulWords(lower);
  if (meaningful.length < 3) return "too_few_meaningful_words";
  if (meaningful.length < 4 && !CONCRETE_WORKFLOW_NOUNS.test(lower)) {
    return "too_few_meaningful_words";
  }

  if (/^(pain|problem|issue|frustration|they|buyer)\b/i.test(lower) && !/\b(log|proof|report|template|spreadsheet|pack|record|builder|detector|resolver|extractor)\b/i.test(lower)) {
    return "buyer_pain_without_artifact";
  }

  if (!hasNounWorkflowArtifact(lower)) return "missing_noun_workflow_artifact";

  return "";
}

function hasVagueSentenceFragment(lower: string) {
  return /\b(they keep|they want|buyer wants|the buyer wants|faster path|is repetitive|is awkward)\b/i.test(lower);
}

function hasNounWorkflowArtifact(lower: string) {
  return /\b[a-z0-9-]+\s+(approval|signoff|revision|feedback|scope|handoff|promise|contradiction|dispute|drift|proof|log|report|pack|builder|detector|resolver|extractor|spreadsheet|template|checklist|record|trail|comment|change|audit|evidence)\b/i.test(lower) ||
    /\b(approval|signoff|revision|feedback|scope|handoff|promise|contradiction|dispute|drift|proof|log|report|pack|builder|detector|resolver|extractor|spreadsheet|template|checklist|record|trail|audit|evidence)\s+[a-z0-9-]+\b/i.test(lower);
}

function sanitizeSearchQuery(query: string, buyer?: string) {
  let cleaned = (query ?? "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (buyer) {
    const rawBuyer = buyer.replace(/\s+/g, " ").trim();
    if (rawBuyer) {
      cleaned = cleaned.replace(new RegExp(escapeRegExp(rawBuyer), "gi"), conciseSearchBuyer(rawBuyer));
    }
  }

  cleaned = cleaned
    .replace(/\bfor\s+([^"]*?,[^"]*)$/i, (_match, suffix: string) => {
      const concise = conciseSearchBuyer(suffix);
      return concise ? `for ${concise}` : "";
    })
    .replace(/\b(ai tool to|they want an ai tool to|they need a modern starter that)\b/gi, "")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

function cleanWorkflowPhrase(text: string) {
  return text
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\b(ai|automated|automatic|tool|app|software|saas|platform|system)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ")
    .toLowerCase();
}

function removeBuyerSuffix(title: string) {
  return title.replace(/\s+for\s+[^,]+$/i, "").trim();
}

function combinePhrases(...parts: string[]) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function conciseSearchBuyer(buyer?: string) {
  const raw = (buyer ?? "").replace(/[^a-zA-Z0-9\s,/-]/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const known: Array<[RegExp, string]> = [
    [/\bweb\s+design\s+agenc/i, "web design agency"],
    [/\bdesign\s+agenc/i, "design agency"],
    [/\bbranding\s+studio/i, "branding studio"],
    [/\bdev\s+shops?\b|\bdevelopment\s+shops?\b/i, "dev shop"],
    [/\btechnical\s+founders?\b/i, "technical founder"],
    [/\bproductized\s+service\b/i, "productized service"],
    [/\bsolo\s+service\s+providers?\b/i, "service provider"],
    [/\bconsultants?\b/i, "consultant"],
    [/\bfreelancers?\b/i, "freelancer"],
    [/\bagenc(?:y|ies)\b/i, "agency"],
    [/\bstudios?\b/i, "studio"],
  ];
  const match = known.find(([pattern]) => pattern.test(lower));
  if (match) return match[1];

  return raw
    .split(/,|;|\/|\band\b/i)
    .map((segment) => segment.trim())
    .filter(Boolean)[0]
    ?.split(/\s+/)
    .slice(0, 3)
    .join(" ")
    .toLowerCase() ?? "";
}

function meaningfulWords(query: string) {
  return query
    .split(/[^a-z0-9]+/i)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 2 && !["the", "for", "and", "with", "from", "that", "into", "they", "want", "need"].includes(word));
}

function hasFullBuyerList(query: string) {
  return /\b(small agencies|agencies),\s*(freelancers|consultants|productized|technical|solo|dev)/i.test(query);
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
