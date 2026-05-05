import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  FileText,
  MessageSquareText,
  RotateCcw,
  Trophy,
} from "lucide-react";
import Link from "next/link";

import { AgentIcon } from "@/components/council/agent-icon";
import { ScoreTable } from "@/components/council/score-table";
import { StatusBadge } from "@/components/council/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCouncilRun } from "@/lib/data/council";
import { currency, formatDate } from "@/lib/utils";

export default async function CouncilOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const council = await getCouncilRun(id);
  const winner = council.winner;
  const evidenceBacked =
    council.marketEvidence.length > 0 ||
    Boolean(council.run.market_evidence_notes?.trim());

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={council.run.status} />
            <Badge variant={evidenceBacked ? "success" : "warning"}>
              {evidenceBacked ? "Evidence-backed" : "Assumption-heavy"}
            </Badge>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden="true" />
              {formatDate(council.run.created_at)}
            </span>
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-semibold tracking-normal">
            {council.run.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {council.run.goal}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/council/${id}/debate`}>
              <MessageSquareText aria-hidden="true" />
              Debate
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/council/${id}/report`}>
              <FileText aria-hidden="true" />
              Report
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/council/${id}/execution`}>
              <ClipboardCheck aria-hidden="true" />
              Execution
            </Link>
          </Button>
        </div>
      </div>

      {winner ? (
        <section className="rounded-lg border border-secondary/40 bg-secondary/12 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-secondary">
                <Trophy className="size-4" aria-hidden="true" />
                Final winner
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-normal">
                {winner.title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {winner.why_buy_source_code}
              </p>
            </div>
            <div className="rounded-lg border border-secondary/30 bg-background/45 px-5 py-4 text-center">
              <p className="text-xs uppercase text-muted-foreground">Total score</p>
              <p className="mt-1 text-3xl font-semibold text-secondary">
                {winner.score?.total_score ?? "?"}/100
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Target buyer</CardDescription>
            <CardTitle className="text-base">{council.run.target_buyer ?? "Open"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Category</CardDescription>
            <CardTitle className="text-base">{council.run.product_category ?? "Any"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Build limit</CardDescription>
            <CardTitle className="text-base">{council.run.build_time_limit ?? "Unset"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Minimum price</CardDescription>
            <CardTitle className="text-base">{currency(council.run.minimum_price)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Market evidence</CardTitle>
          <CardDescription>
            {evidenceBacked
              ? `${council.marketEvidence.length} structured evidence item(s) plus any pasted observations are available to the council.`
              : "No market evidence was provided, so the council should treat demand as unverified."}
          </CardDescription>
        </CardHeader>
        {council.marketEvidence.length ? (
          <CardContent className="grid gap-3 md:grid-cols-3">
            {council.marketEvidence.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-background/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  <Badge variant="muted">{item.strength_score}/10</Badge>
                </div>
                <p className="mt-2 text-xs uppercase text-muted-foreground">
                  {item.source_type} / {item.signal_type}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.content}
                </p>
              </div>
            ))}
          </CardContent>
        ) : null}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Scoreboard</CardTitle>
            <CardDescription>
              Scored from 1-10 across ten source-code product criteria.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreTable ideas={council.ideas} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Council agents</CardTitle>
            <CardDescription>Default roles for the debate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {council.agents.map((agent) => (
              <div key={agent.key} className="flex items-center gap-3">
                <AgentIcon agent={agent} className="size-9" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{agent.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run artifacts</CardTitle>
          <CardDescription>Jump into the debate transcript or final package plan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href={`/council/${id}/debate`}>
              <MessageSquareText aria-hidden="true" />
              View debate
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/council/${id}/report`}>
              <FileText aria-hidden="true" />
              View report
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/council/${id}/execution`}>
              <ClipboardCheck aria-hidden="true" />
              Open Execution Plan
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Badge variant="muted" className="h-10 px-3">
            <RotateCcw className="mr-2 size-4" aria-hidden="true" />
            Rerun endpoint ready
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
