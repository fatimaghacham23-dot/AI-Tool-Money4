import type {
  FactoryFilters,
  FactoryOverview,
  FactoryProductIdea,
  FactoryStatus,
} from "@/lib/data/types";

export const FACTORY_STATUS_OPTIONS: Array<{
  value: FactoryStatus;
  label: string;
}> = [
  { value: "generated", label: "Generated" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "winner", label: "Winner" },
  { value: "validating", label: "Validating" },
  { value: "building", label: "Building" },
  { value: "packaged", label: "Packaged" },
  { value: "launched", label: "Launched" },
  { value: "sold", label: "Sold" },
  { value: "rejected", label: "Rejected" },
  { value: "watchlist", label: "Watchlist" },
];

export const SCORE_RANGE_OPTIONS: Array<{
  value: NonNullable<FactoryFilters["scoreRange"]>;
  label: string;
}> = [
  { value: "all", label: "All scores" },
  { value: "90-100", label: "90-100" },
  { value: "80-89", label: "80-89" },
  { value: "70-79", label: "70-79" },
  { value: "under-70", label: "Under 70" },
];

export function createFactoryOverview(
  ideas: FactoryProductIdea[],
): FactoryOverview {
  const scoredIdeas = ideas.filter((idea) => idea.score);
  const scoreTotal = scoredIdeas.reduce(
    (total, idea) => total + (idea.score?.total_score ?? 0),
    0,
  );
  const highestScoringIdea = scoredIdeas.reduce<FactoryProductIdea | null>(
    (highest, idea) => {
      if (!highest || (idea.score?.total_score ?? 0) > (highest.score?.total_score ?? 0)) {
        return idea;
      }

      return highest;
    },
    null,
  );

  return {
    totalIdeas: ideas.length,
    winnersSelected: ideas.filter(
      (idea) => idea.factory_status === "winner" || idea.status === "winner",
    ).length,
    productsInValidation: ideas.filter(
      (idea) => idea.factory_status === "validating",
    ).length,
    productsInBuild: ideas.filter((idea) => idea.factory_status === "building").length,
    productsReadyToSell: ideas.filter((idea) =>
      ["packaged", "launched"].includes(idea.factory_status),
    ).length,
    averageScore: scoredIdeas.length
      ? Math.round((scoreTotal / scoredIdeas.length) * 10) / 10
      : null,
    highestScoringIdea,
  };
}

export function filterFactoryProductIdeas(
  ideas: FactoryProductIdea[],
  filters: FactoryFilters,
) {
  return ideas.filter((idea) => {
    if (filters.status && filters.status !== "all" && idea.factory_status !== filters.status) {
      return false;
    }

    if (
      filters.buyerType &&
      filters.buyerType !== "all" &&
      normalizeBuyer(idea.target_buyer ?? idea.councilRun.target_buyer) !== filters.buyerType
    ) {
      return false;
    }

    if (!matchesScoreRange(idea.score?.total_score ?? null, filters.scoreRange ?? "all")) {
      return false;
    }

    if (filters.evidenceBackedOnly && idea.evidenceStatus === "needs_validation") {
      return false;
    }

    if (filters.highLinkedInVirality && (idea.score?.linkedin_virality ?? 0) < 8) {
      return false;
    }

    if (filters.fastBuildOnly && (idea.score?.build_speed ?? 0) < 8) {
      return false;
    }

    if (filters.highPricePotential && (idea.score?.price_potential ?? 0) < 8) {
      return false;
    }

    return true;
  });
}

export function getBuyerOptions(ideas: FactoryProductIdea[]) {
  return Array.from(
    new Set(
      ideas
        .map((idea) => normalizeBuyer(idea.target_buyer ?? idea.councilRun.target_buyer))
        .filter(Boolean),
    ),
  ).sort();
}

export function normalizeBuyer(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function factoryStatusLabel(status: FactoryStatus) {
  return FACTORY_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function evidenceStatusLabel(
  status: FactoryProductIdea["evidenceStatus"],
) {
  if (status === "evidence_backed") {
    return "Evidence-backed";
  }

  if (status === "run_evidence") {
    return "Run evidence";
  }

  return "Needs validation";
}

export function evidenceStatusVariant(
  status: FactoryProductIdea["evidenceStatus"],
) {
  if (status === "needs_validation") {
    return "warning" as const;
  }

  return "success" as const;
}

function matchesScoreRange(
  score: number | null,
  range: NonNullable<FactoryFilters["scoreRange"]>,
) {
  if (range === "all") {
    return true;
  }

  if (score === null) {
    return false;
  }

  if (range === "90-100") {
    return score >= 90;
  }

  if (range === "80-89") {
    return score >= 80 && score <= 89;
  }

  if (range === "70-79") {
    return score >= 70 && score <= 79;
  }

  return score < 70;
}
