import type {
  ProductScore,
  ProductScoreExplanations,
  MarketEvidenceDraft,
  ScoredProductIdea,
} from "@/ai/types";

export type RubricKey = Exclude<keyof ProductScore, "productIdeaId" | "total_score">;

export const DAY_ONE_BUILD_THRESHOLD = 85;

export const SCORING_RUBRIC: Array<{
  key: RubricKey;
  label: string;
  description: string;
}> = [
  {
    key: "buyer_urgency",
    label: "Buyer Urgency",
    description: "How painful/urgent the problem is right now for a real buyer.",
  },
  {
    key: "existing_purchase_behavior",
    label: "Existing Purchase Behavior",
    description:
      "Whether buyers already pay for workarounds, services, contractors, or indirect tools for this pain.",
  },
  {
    key: "linkedin_demo_strength",
    label: "LinkedIn Demo Strength",
    description: "How likely a post/demo generates clear wow + instant understanding.",
  },
  {
    key: "comment_dm_likelihood",
    label: "Comment/DM Likelihood",
    description: "Likelihood of comments/DMs like: code / price / send me / I need this.",
  },
  {
    key: "actual_tool_gap",
    label: "Actual Tool Gap",
    description: "Whether this exact tool is not already a common SaaS/tool category in the market.",
  },
  {
    key: "source_code_gap",
    label: "Source-Code Kit Gap",
    description: "Whether there is no obvious polished source-code kit for this exact workflow.",
  },
  {
    key: "manual_workaround_pain",
    label: "Manual Workaround Pain",
    description:
      "Whether buyers currently do this manually (docs/spreadsheets/Slack/Notion/email/screenshots/repetition) and lose time/money.",
  },
  {
    key: "hidden_workflow_specificity",
    label: "Hidden Workflow Specificity",
    description: "Whether the idea targets a specific workflow vs a generic broad category.",
  },
  {
    key: "price_believability",
    label: "Price Believability",
    description: "Whether a one-time price feels believable for this buyer today.",
  },
  {
    key: "build_speed",
    label: "Build Speed",
    description: "How quickly Ahmad can build a sellable v0/v1 to support validation.",
  },
];

export const DEFAULT_SCORE_EXPLANATIONS: ProductScoreExplanations = {
  buyer_urgency: "The buyer pain is urgent enough to justify action today.",
  existing_purchase_behavior:
    "Buyers already spend money (tools, contractors, services) or time on workarounds for this problem.",
  linkedin_demo_strength: "The product can be shown in a sharp before/after demo.",
  comment_dm_likelihood:
    "The post is likely to trigger comments/DMs like 'price' or 'send me the code'.",
  actual_tool_gap: "This exact tool is not already common as a polished SaaS or generic AI tool.",
  source_code_gap: "There is no obvious existing source-code kit that already solves this workflow well.",
  manual_workaround_pain: "Buyers currently solve this manually and waste time/money (workarounds).",
  hidden_workflow_specificity: "The workflow is specific and non-generic (not just 'an AI generator').",
  price_believability: "A one-time price is believable for this buyer and urgency.",
  build_speed: "Ahmad can ship a sellable validation-ready version quickly.",
};

export function clampScore(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(10, Math.max(0, Math.round(value)));
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
    const urgencyEvidence = ideaEvidence.some((item) =>
      ["pain", "demand", "buyer_comment", "willingness_to_pay"].includes(item.signalType),
    );
    const purchaseBehaviorEvidence = ideaEvidence.some((item) =>
      ["willingness_to_pay", "pricing_signal"].includes(item.signalType) ||
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
    const demoBonus = /before.*after|demo|video|screenshot|viral|linkedin/.test(text) ? 1 : 0;
    const scopePenalty = /marketplace|platform|crm/.test(text) ? 1 : 0;
    const freshness = Math.max(0, 2 - Math.floor(index / 5));

    const nicheBonus = /for\s+(lawyers|dentists|real estate|agenc|recruit|coach|consult)/.test(text)
      ? 1
      : 0;

    return normalizeScore({
      buyer_urgency: 7 + agencyBonus + evidenceBonus + (urgencyEvidence ? 1 : 0),
      existing_purchase_behavior: 6 + evidenceBonus + (purchaseBehaviorEvidence ? 1 : 0),
      linkedin_demo_strength: 7 + demoBonus + (linkedinEvidence ? 1 : 0),
      comment_dm_likelihood: 7 + demoBonus + sourceBonus + (linkedinEvidence ? 1 : 0),
      actual_tool_gap: 6 + freshness - (/(proposal generator|chatbot|content generator|resume|invoice|meeting|calendar|email assistant|website audit)/.test(text) ? 3 : 0),
      source_code_gap: 6 + freshness - (sourceBonus ? 2 : 0),
      manual_workaround_pain: 6 + evidenceBonus + (urgencyEvidence ? 1 : 0),
      hidden_workflow_specificity: 6 + nicheBonus - (/(generator|assistant|chatbot|copilot)/.test(text) ? 2 : 0),
      price_believability: 7 + agencyBonus + (priceEvidence ? 1 : 0),
      build_speed: 8 - scopePenalty,
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
    const isGenericCategory =
      /proposal generator|chatbot|content generator|resume|invoice|meeting summar|calendar|email assistant|website audit/.test(
        text,
      );
    const hasAI = /ai|agent|generator|analyzer|automation|copilot/.test(text);

    const evidencePhrase = strongestEvidence
      ? ` Evidence used: ${strongestEvidence.title} (${strongestEvidence.signalType}, ${strongestEvidence.strengthScore}/10).`
      : " No direct market evidence was provided, so this remains assumption-heavy.";

    return normalizeScoreExplanations({
      buyer_urgency: isAgency
        ? `Agencies and freelancers feel client-facing workflow pain quickly, especially when it blocks delivery.${evidencePhrase}`
        : `Urgency depends on sharper positioning, but the buyer pain is concrete enough to test.${evidencePhrase}`,
      existing_purchase_behavior: isTemplate
        ? `This resembles things buyers already pay for: starters, templates, code packages, or implementation shortcuts.${evidencePhrase}`
        : `Purchase behavior still needs proof from paid alternatives, services, or source-code buyer comments.${evidencePhrase}`,
      linkedin_demo_strength: hasAI
        ? `The demo can show AI transforming messy input into a finished buyer-ready artifact.${evidencePhrase}`
        : `The demo needs a strong before-and-after to stop a LinkedIn scroll.${evidencePhrase}`,
      comment_dm_likelihood:
        "The post must make the package concrete enough to earn comments or DMs asking for code, price, or demo access.",
      actual_tool_gap: isGenericCategory
        ? "This resembles a common category; it must be narrowed to a specific unsolved workflow gap to qualify."
        : `The opportunity should be a niche workflow where no obvious dedicated tool already dominates.${evidencePhrase}`,
      source_code_gap: isTemplate
        ? "This resembles a common kit/template pattern; the source-code gap may be weak unless the workflow is unusually specific."
        : "A viable idea has no obvious polished kit already solving this exact workflow end-to-end.",
      manual_workaround_pain:
        "The best opportunities replace repetitive manual work (spreadsheets, docs, Slack, Notion, email, screenshots, copying) that buyers complain about.",
      hidden_workflow_specificity:
        isGenericCategory
          ? "This must be reframed as a very specific hidden workflow (not a generic AI wrapper) to score well."
          : "The workflow should be specific enough that the demo is instantly understood and feels new.",
      price_believability: isAgency
        ? "Agency resale use makes a one-time source-code price more believable."
        : "Pricing needs a clear promise of saved engineering time and faster validation.",
      build_speed: "A narrow V1 can ship by focusing on one main workflow and postponing integrations.",
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
