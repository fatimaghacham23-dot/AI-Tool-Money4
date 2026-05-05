import {
  ChevronLeft,
  ClipboardCheck,
  Code2,
  DollarSign,
  FileText,
  ShieldCheck,
  Target,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SCORING_RUBRIC, normalizeScoreExplanations } from "@/ai/scoring";
import { ProductFactoryNotes } from "@/components/factory/product-factory-notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  evidenceStatusLabel,
  evidenceStatusVariant,
  factoryStatusLabel,
} from "@/lib/data/factory-utils";
import { getProductDetailWithContext } from "@/lib/data/factory";
import { formatDate } from "@/lib/utils";
import type { Json } from "@/types/database";

export default async function ProductFactoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getProductDetailWithContext(id);

  if (!detail) {
    notFound();
  }

  const { idea, execution, marketEvidence, salesAssets, codexPrompt } = detail;
  const scoreExplanations = normalizeScoreExplanations(
    jsonObject(idea.score?.score_explanations) ?? null,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href="/factory">
              <ChevronLeft aria-hidden="true" />
              Factory
            </Link>
          </Button>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{factoryStatusLabel(idea.factory_status)}</Badge>
            <Badge variant={evidenceStatusVariant(idea.evidenceStatus)}>
              {evidenceStatusLabel(idea.evidenceStatus)}
            </Badge>
            {idea.watchlisted ? <Badge variant="muted">Watchlisted</Badge> : null}
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-semibold tracking-normal">
            {idea.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {idea.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/council/${idea.councilRun.id}/report`}>
              <FileText aria-hidden="true" />
              Council report
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/council/${idea.councilRun.id}/execution`}>
              <ClipboardCheck aria-hidden="true" />
              Execution plan
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/factory/${idea.id}/package`}>
              Package Plan
            </Link>
          </Button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Snapshot
          icon={Target}
          label="Buyer"
          value={idea.target_buyer ?? idea.councilRun.target_buyer ?? "Open"}
        />
        <Snapshot
          icon={Trophy}
          label="Day-One Probability"
          value={idea.score ? `${idea.score.total_score}/100` : "Pending"}
        />
        <Snapshot
          icon={DollarSign}
          label="Price believability"
          value={idea.score ? `${idea.score.price_believability}/10` : "Pending"}
        />
        <Snapshot
          icon={ShieldCheck}
          label="Execution"
          value={execution?.progress.currentPhase ?? "No plan"}
        />
      </section>

      <ProductFactoryNotes
        productIdeaId={idea.id}
        initialStatus={idea.factory_status}
        initialNotes={idea.notes}
        initialRejectedReason={idea.rejected_reason}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <InfoPanel title="Summary" value={idea.description} />
        <InfoPanel title="Pain" value={idea.pain ?? "No pain statement saved."} />
        <InfoPanel
          title="Why Buy Source Code"
          value={idea.why_buy_source_code ?? "No source-code rationale saved."}
        />
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="text-xl font-semibold tracking-normal">Score Breakdown</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Day-One Sale Probability scoring, with the explanation attached to each criterion.
          </p>
        </div>
        {idea.score ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Criterion</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Explanation</th>
                </tr>
              </thead>
              <tbody>
                {SCORING_RUBRIC.map((item) => (
                  <tr key={item.key} className="border-t border-border align-top">
                    <td className="px-4 py-4 font-medium">{item.label}</td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {idea.score?.[item.key]}/10
                    </td>
                    <td className="px-4 py-4 leading-6 text-muted-foreground">
                      {scoreExplanations[item.key]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 text-sm text-muted-foreground">
            No score has been saved for this product idea yet.
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ListPanel title="MVP Features" items={idea.mvp_features} />
        <ListPanel title="Full Package Features" items={idea.full_features} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ListPanel title="Risks" items={idea.risks} />
        <LinkedContext
          councilRunTitle={idea.councilRun.title}
          councilRunId={idea.councilRun.id}
          executionPlanId={execution?.plan.id ?? null}
          createdAt={idea.created_at}
        />
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="text-xl font-semibold tracking-normal">Evidence Used</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {marketEvidence.length} item(s) connected to this idea or its council run.
          </p>
        </div>
        {marketEvidence.length ? (
          <div className="grid gap-3 p-5 lg:grid-cols-2">
            {marketEvidence.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-background/35 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{item.title}</p>
                  <Badge variant="muted">{item.strength_score}/10</Badge>
                </div>
                <p className="mt-2 text-xs uppercase text-muted-foreground">
                  {item.source_type} / {item.signal_type}
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {item.content}
                </p>
                {item.source_url ? (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-sm text-primary hover:underline"
                  >
                    Open source
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5 text-sm text-muted-foreground">
            No evidence is attached yet.
          </div>
        )}
      </section>

      {codexPrompt ? (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border p-5">
            <Code2 className="size-5 text-primary" aria-hidden="true" />
            <h2 className="text-xl font-semibold tracking-normal">Codex Prompt</h2>
          </div>
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap p-5 text-sm leading-7 text-muted-foreground">
            {codexPrompt}
          </pre>
        </section>
      ) : null}

      {salesAssets.length ? (
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-5">
            <h2 className="text-xl font-semibold tracking-normal">Sales Assets</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Launch, DM, comment, and pricing copy connected to the execution plan.
            </p>
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {salesAssets.map((asset) => (
              <div
                key={asset.id}
                className="rounded-lg border border-border bg-background/35 p-4"
              >
                <Badge variant="muted">{asset.asset_type.replaceAll("_", " ")}</Badge>
                <h3 className="mt-3 font-semibold tracking-normal">{asset.title}</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                  {asset.content}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Snapshot({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Target;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-3 text-base font-semibold leading-6">{value}</p>
    </div>
  );
}

function InfoPanel({ title, value }: { title: string; value: string }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-base font-semibold tracking-normal">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{value}</p>
    </section>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-base font-semibold tracking-normal">{title}</h2>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No items saved.</p>
      )}
    </section>
  );
}

function LinkedContext({
  councilRunTitle,
  councilRunId,
  executionPlanId,
  createdAt,
}: {
  councilRunTitle: string;
  councilRunId: string;
  executionPlanId: string | null;
  createdAt: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-base font-semibold tracking-normal">Linked Context</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
        <p>Council run: {councilRunTitle}</p>
        <p>Created: {formatDate(createdAt)}</p>
        <p>Execution plan: {executionPlanId ?? "Not created yet"}</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/council/${councilRunId}/report`}>
            <FileText aria-hidden="true" />
            Report
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/council/${councilRunId}/execution`}>
            <ClipboardCheck aria-hidden="true" />
            Execution
          </Link>
        </Button>
      </div>
    </section>
  );
}

function jsonObject(value: Json | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, string>;
}
