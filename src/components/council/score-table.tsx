import { SCORING_RUBRIC } from "@/ai/scoring";
import type { ProductIdeaView } from "@/lib/data/types";

export function ScoreTable({ ideas }: { ideas: ProductIdeaView[] }) {
  const scored = ideas
    .filter((idea) => idea.score)
    .sort((a, b) => (b.score?.total_score ?? 0) - (a.score?.total_score ?? 0));

  if (!scored.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Scores will appear after Round 5 completes.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-3">Product</th>
            {SCORING_RUBRIC.map((item) => (
              <th key={item.key} className="px-3 py-3">
                {item.label}
              </th>
            ))}
            <th className="px-3 py-3">Rationale</th>
            <th className="px-3 py-3 text-right">Day-One Probability</th>
          </tr>
        </thead>
        <tbody>
          {scored.map((idea) => (
            <tr key={idea.id} className="border-t border-border">
              <td className="max-w-[220px] px-3 py-3 font-medium">{idea.title}</td>
              {SCORING_RUBRIC.map((item) => (
                <td key={item.key} className="px-3 py-3 text-muted-foreground">
                  {idea.score?.[item.key]}/10
                </td>
              ))}
              <td className="max-w-[280px] px-3 py-3 text-xs leading-5 text-muted-foreground">
                {scoreRationale(idea.score?.score_explanations)}
              </td>
              <td className="px-3 py-3 text-right text-base font-semibold text-primary">
                {idea.score?.total_score}/100
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function scoreRationale(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Scoring rationale is stored with future council runs.";
  }

  const explanations = Object.values(value)
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 2);

  return explanations.length ? explanations.join(" ") : "No rationale provided.";
}
