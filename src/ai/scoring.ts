import type {
  ProductScore,
  ProductScoreExplanations,
  MarketEvidenceDraft,
  ScoredProductIdea,
} from "@/ai/types";

export type RubricKey = Exclude<keyof ProductScore, "productIdeaId" | "total_score">;

export const SCORING_RUBRIC: Array<{
  key: RubricKey;
  label: string;
  description: string;
}> = [
  {
    key: "buyer_demand",
    label: "Buyer Demand",
    description: "How clearly a real buyer already wants this outcome.",
  },
  {
    key: "linkedin_virality",
    label: "LinkedIn Virality",
    description: "How compelling the product looks in a post or short demo.",
  },
  {
    key: "source_code_resale_value",
    label: "Source-Code Resale Value",
    description: "Whether the code package itself feels worth purchasing.",
  },
  {
    key: "build_speed",
    label: "Build Speed",
    description: "How realistically Ahmad can build a high-quality V1 quickly.",
  },
  {
    key: "demo_quality",
    label: "Demo Quality",
    description: "How visual and concrete the demo can be.",
  },
  {
    key: "ai_value",
    label: "AI Usefulness",
    description: "How much AI improves the workflow beyond a normal CRUD app.",
  },
  {
    key: "customization_potential",
    label: "Customization Potential",
    description: "How easily buyers can adapt it to niches or clients.",
  },
  {
    key: "competition_weakness",
    label: "Competition Weakness",
    description: "Whether existing alternatives are weak, expensive, or generic.",
  },
  {
    key: "price_potential",
    label: "Price Potential",
    description: "How confidently the source package can command a premium.",
  },
  {
    key: "ahmad_founder_fit",
    label: "Ahmad Founder Fit",
    description: "Fit with Ahmad as a software engineer selling on LinkedIn.",
  },
];

export const DEFAULT_SCORE_EXPLANATIONS: ProductScoreExplanations = {
  buyer_demand: "Buyer demand is plausible for source-code buyers in this niche.",
  linkedin_virality: "The idea can be explained in a visible LinkedIn demo.",
  source_code_resale_value:
    "The source code has reusable implementation value beyond a hosted app.",
  build_speed: "A focused MVP is realistic for one engineer in the requested window.",
  demo_quality: "The product has a before-and-after workflow that can be shown quickly.",
  ai_value: "AI helps produce or analyze useful output inside the core workflow.",
  customization_potential:
    "Buyers can adapt branding, prompts, schema, and workflows for niches.",
  competition_weakness:
    "Existing alternatives are generic, subscription-only, or not source-code packages.",
  price_potential:
    "The package can justify a meaningful one-time source-code price.",
  ahmad_founder_fit:
    "The idea fits Ahmad's engineering strengths and LinkedIn audience.",
};

export function clampScore(value: number) {
  if (Number.isNaN(value)) {
    return 1;
  }

  return Math.min(10, Math.max(1, Math.round(value)));
}

export function calculateTotalScore(score: Omit<ProductScore, "total_score">) {
  return SCORING_RUBRIC.reduce((total, item) => {
    return total + clampScore(score[item.key]);
  }, 0);
}

export function normalizeScoreExplanations(
  explanations?: Partial<ProductScoreExplanations> | null,
): ProductScoreExplanations {
  return SCORING_RUBRIC.reduce((accumulator, item) => {
    const value = explanations?.[item.key];
    accumulator[item.key] =
      typeof value === "string" && value.trim()
        ? value.trim()
        : DEFAULT_SCORE_EXPLANATIONS[item.key];
    return accumulator;
  }, {} as ProductScoreExplanations);
}

export function normalizeScore(score: Partial<ProductScore>): ProductScore {
  const normalized = SCORING_RUBRIC.reduce((accumulator, item) => {
    accumulator[item.key] = clampScore(Number(score[item.key] ?? 6));
    return accumulator;
  }, {} as Record<RubricKey, number>);

  return {
    ...normalized,
    productIdeaId: score.productIdeaId,
    total_score: calculateTotalScore(normalized),
  };
}

export function sortByScore(ideas: ScoredProductIdea[]) {
  return [...ideas].sort((a, b) => b.score.total_score - a.score.total_score);
}

export function scoreIdeasLocally<T extends { title: string; description: string }>(
  ideas: T[],
  evidence: MarketEvidenceDraft[] = [],
) {
  return ideas.map((idea, index) => {
    const text = `${idea.title} ${idea.description}`.toLowerCase();
    const ideaEvidence = evidenceForIdea(idea, evidence);
    const averageEvidenceStrength = averageStrength(ideaEvidence);
    const hasEvidence = ideaEvidence.length > 0;
    const demandEvidence = ideaEvidence.some((item) =>
      ["pain", "demand", "buyer_comment", "willingness_to_pay"].includes(
        item.signalType,
      ),
    );
    const competitorEvidence = ideaEvidence.some(
      (item) =>
        item.signalType === "competitor_weakness" ||
        item.sourceType === "competitor",
    );
    const linkedinEvidence = ideaEvidence.some(
      (item) => item.sourceType === "linkedin" || item.signalType === "buyer_comment",
    );
    const priceEvidence = ideaEvidence.some(
      (item) => item.signalType === "willingness_to_pay" || item.signalType === "pricing_signal",
    );
    const evidenceBonus = hasEvidence
      ? averageEvidenceStrength >= 8
        ? 2
        : averageEvidenceStrength >= 6
          ? 1
          : 0
      : -1;
    const agencyBonus = /agency|client|portal|proposal|dashboard/.test(text) ? 1 : 0;
    const sourceBonus = /template|starter|source|white-label|portal/.test(text) ? 1 : 0;
    const aiBonus = /ai|agent|generator|analyzer|automation/.test(text) ? 1 : 0;
    const scopePenalty = /marketplace|platform|crm/.test(text) ? 1 : 0;
    const freshness = Math.max(0, 2 - Math.floor(index / 5));

    return normalizeScore({
      buyer_demand: 7 + agencyBonus + evidenceBonus + (demandEvidence ? 1 : 0),
      linkedin_virality: 7 + aiBonus + (linkedinEvidence ? 1 : 0),
      source_code_resale_value: 7 + sourceBonus,
      build_speed: 8 - scopePenalty,
      demo_quality: 7 + aiBonus,
      ai_value: 7 + aiBonus,
      customization_potential: 7 + agencyBonus + sourceBonus,
      competition_weakness: 6 + freshness + (competitorEvidence ? 1 : 0),
      price_potential: 7 + agencyBonus + (priceEvidence ? 1 : 0),
      ahmad_founder_fit: 8,
    });
  });
}

export function explainScoresLocally<
  T extends { title: string; description: string; targetBuyer?: string; pain?: string },
>(ideas: T[], evidence: MarketEvidenceDraft[] = []): ProductScoreExplanations[] {
  return ideas.map((idea) => {
    const text = `${idea.title} ${idea.description}`.toLowerCase();
    const ideaEvidence = evidenceForIdea(idea, evidence);
    const strongestEvidence = [...ideaEvidence].sort(
      (a, b) => b.strengthScore - a.strengthScore,
    )[0];
    const isAgency = /agency|client|portal|proposal/.test(text);
    const isTemplate = /template|starter|source|white-label|dashboard/.test(text);
    const hasAI = /ai|agent|generator|analyzer|automation|copilot/.test(text);
    const evidencePhrase = strongestEvidence
      ? ` Evidence used: ${strongestEvidence.title} (${strongestEvidence.signalType}, ${strongestEvidence.strengthScore}/10).`
      : " No direct market evidence was provided, so this remains assumption-heavy.";

    return normalizeScoreExplanations({
      buyer_demand: isAgency
        ? `Agencies and freelancers repeatedly buy shortcuts for client-facing workflows.${evidencePhrase}`
        : `Demand depends on sharp positioning, but the buyer pain is concrete enough to test.${evidencePhrase}`,
      linkedin_virality: hasAI
        ? `The demo can show AI transforming messy input into a finished client-ready artifact.${evidencePhrase}`
        : `The demo needs a strong before-and-after to stop a LinkedIn scroll.${evidencePhrase}`,
      source_code_resale_value: isTemplate
        ? "The source package saves auth, schema, UI, prompts, and deployment setup time."
        : "The code must include docs, seed data, and customization notes to feel worth buying.",
      build_speed:
        "A narrow V1 can ship by focusing on one main workflow and postponing integrations.",
      demo_quality:
        "The product can show input, AI processing, polished output, and source-code packaging.",
      ai_value: hasAI
        ? "AI is useful because it creates analysis, summaries, drafts, or recommendations."
        : "AI must be tied to a real workflow rather than added as decorative automation.",
      customization_potential: isAgency
        ? "Agencies can rebrand, tune prompts, and adapt the data model for client niches."
        : "Customization value comes from editable prompts, schema, and UI sections.",
      competition_weakness:
        ideaEvidence.some((item) => item.signalType === "competitor_weakness")
          ? `Competitor evidence suggests a gap buyers may care about.${evidencePhrase}`
          : `Most alternatives may be subscription-only, but competitor weakness still needs proof.${evidencePhrase}`,
      price_potential: isAgency
        ? "Agency resale use supports higher Pro and Agency license pricing."
        : "Pricing needs a clear promise of saved engineering time.",
      ahmad_founder_fit:
        "Ahmad can credibly sell this as a software engineer showing real architecture and code.",
    });
  });
}

function evidenceForIdea<T extends { title: string; description: string }>(
  idea: T,
  evidence: MarketEvidenceDraft[],
) {
  const maybeIdeaWithId = idea as T & { id?: unknown };
  const ideaId =
    typeof maybeIdeaWithId.id === "string" ? maybeIdeaWithId.id : null;
  const titleWords = idea.title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);

  return evidence.filter((item) => {
    if (item.productIdeaId && ideaId) {
      return item.productIdeaId === ideaId;
    }

    const evidenceText = `${item.title} ${item.content}`.toLowerCase();
    return titleWords.some((word) => evidenceText.includes(word));
  });
}

function averageStrength(evidence: MarketEvidenceDraft[]) {
  if (!evidence.length) {
    return 0;
  }

  return (
    evidence.reduce((total, item) => total + item.strengthScore, 0) / evidence.length
  );
}
