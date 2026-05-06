export type MarketEvidenceInsertDiagnostic = {
  source: string;
  strengthScore: number;
  originalStrengthScoreType: string;
  originalStrengthScoreValueRedactedOrNumberOnly: number | null;
};

export function normalizeStrengthScore(value: unknown): number {
  if (value == null) {
    return 5;
  }

  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return 5;
  }

  if (numeric > 10) {
    return Math.max(1, Math.min(10, Math.ceil(numeric / 10)));
  }

  return Math.max(1, Math.min(10, Math.round(numeric)));
}

export function createMarketEvidenceInsertDiagnostic(input: {
  source: string;
  strengthScore: unknown;
}): MarketEvidenceInsertDiagnostic {
  const original =
    typeof input.strengthScore === "number" && Number.isFinite(input.strengthScore)
      ? input.strengthScore
      : null;

  return {
    source: input.source,
    strengthScore: normalizeStrengthScore(input.strengthScore),
    originalStrengthScoreType:
      input.strengthScore === null ? "null" : typeof input.strengthScore,
    originalStrengthScoreValueRedactedOrNumberOnly: original,
  };
}
