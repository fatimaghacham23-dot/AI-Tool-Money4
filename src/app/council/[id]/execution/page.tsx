import {
  CalendarDays,
  ChevronLeft,
  DollarSign,
  FileText,
  Gauge,
  ShieldCheck,
  Target,
  Trophy,
} from "lucide-react";
import Link from "next/link";

import { SalesAssetsPanel } from "@/components/execution/sales-assets-panel";
import { TaskBoard } from "@/components/execution/task-board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCouncilRun } from "@/lib/data/council";
import { getOrCreateExecutionPlan } from "@/lib/data/execution";
import { currency } from "@/lib/utils";

export default async function ExecutionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const council = await getCouncilRun(id);
  const execution = await getOrCreateExecutionPlan(id, council);
  const winner = council.winner;
  const report = council.report;
  const evidenceBacked =
    council.marketEvidence.length > 0 ||
    Boolean(council.run.market_evidence_notes?.trim());

  if (!winner || !execution) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href={`/council/${id}`}>
            <ChevronLeft aria-hidden="true" />
            Overview
          </Link>
        </Button>
        <Card>
          <CardContent className="p-8 text-center text-sm leading-6 text-muted-foreground">
            The execution plan appears only after the Judge Agent selects Build now
            with an 85+ Day-One Sale Probability.
          </CardContent>
        </Card>
      </div>
    );
  }

  const offer =
    extractMarkdownSection(report?.report_markdown ?? "", "One-Sentence Offer") ||
    winner.description;
  const targetPrice =
    winner.pricing_idea ??
    (council.run.minimum_price ? `From ${currency(council.run.minimum_price)}` : "Unset");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href={`/council/${id}`}>
              <ChevronLeft aria-hidden="true" />
              Overview
            </Link>
          </Button>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">
            Execution Plan
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            A build-now council report converted into validation, build, packaging,
            and LinkedIn launch work.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/council/${id}/report`}>
            <FileText aria-hidden="true" />
            Final report
          </Link>
        </Button>
      </div>

      <section className="rounded-lg border border-secondary/40 bg-secondary/12 p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-secondary">
              <Trophy className="size-4" aria-hidden="true" />
              Product Snapshot
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">
              {winner.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {offer}
            </p>
          </div>
          <div className="rounded-lg border border-secondary/30 bg-background/45 px-6 py-5 text-center">
            <p className="text-xs uppercase text-muted-foreground">
              Day-One Sale Probability
            </p>
            <p className="mt-1 text-4xl font-semibold text-secondary">
              {winner.score?.total_score ?? "?"}/100
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SnapshotItem
            icon={Target}
            label="Buyer"
            value={winner.target_buyer ?? council.run.target_buyer ?? "Open"}
          />
          <SnapshotItem icon={DollarSign} label="Target price" value={targetPrice} />
          <SnapshotItem
            icon={CalendarDays}
            label="Build time"
            value={council.run.build_time_limit ?? "7-14 days"}
          />
          <SnapshotItem
            icon={ShieldCheck}
            label="Evidence status"
            value={evidenceBacked ? "Evidence-backed" : "Assumption-heavy"}
            badgeVariant={evidenceBacked ? "success" : "warning"}
          />
          <SnapshotItem
            icon={Gauge}
            label="Current phase"
            value={execution.progress.currentPhase}
          />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-normal">Progress Tracker</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {execution.progress.completedTasks} of {execution.progress.totalTasks} tasks complete.
            </p>
          </div>
          <Badge variant={execution.progress.progressPercent === 100 ? "success" : "muted"}>
            {execution.progress.progressPercent}% complete
          </Badge>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-secondary transition-all"
            style={{ width: `${execution.progress.progressPercent}%` }}
          />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ProgressStat label="Total tasks" value={execution.progress.totalTasks} />
          <ProgressStat label="Completed" value={execution.progress.completedTasks} />
          <ProgressStat label="Current phase" value={execution.progress.currentPhase} />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">Execution Tasks</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Work through validation before building, then ship the source-code package
            and launch assets in order.
          </p>
        </div>
        <TaskBoard tasks={execution.tasks} />
      </section>

      <SalesAssetsPanel planId={execution.plan.id} assets={execution.salesAssets} />
    </div>
  );
}

function SnapshotItem({
  icon: Icon,
  label,
  value,
  badgeVariant,
}: {
  icon: typeof Target;
  label: string;
  value: string | number;
  badgeVariant?: "success" | "warning" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/35 p-4">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </div>
      {badgeVariant ? (
        <Badge variant={badgeVariant} className="mt-3">
          {value}
        </Badge>
      ) : (
        <p className="mt-3 text-sm font-medium leading-6">{value}</p>
      )}
    </div>
  );
}

function ProgressStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background/35 p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-normal">{value}</p>
    </div>
  );
}

function extractMarkdownSection(markdown: string, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^|\\n)##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|\\n#\\s+|$)`,
    "i",
  );
  const match = markdown.match(pattern);

  return match?.[2]?.trim() ?? "";
}
