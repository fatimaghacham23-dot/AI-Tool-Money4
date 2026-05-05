import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ChevronRight,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const topScoredIdea = [...council.ideas]
    .filter((idea) => idea.score)
    .sort((a, b) => (b.score?.total_score ?? 0) - (a.score?.total_score ?? 0))[0] ?? null;
  const spotlightIdea = winner ?? topScoredIdea;
  const finalDecision =
    council.report?.final_decision ?? (winner ? "build_now" : null);
  const dayOneSaleProbability =
    council.report?.day_one_sale_probability ?? spotlightIdea?.score?.total_score ?? null;
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

      {council.run.status === "failed" ? (
        <section className="rounded-lg border border-destructive/40 bg-destructive/12 p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              Council run failed
            </div>
            {council.run.error_message ? (
              <p className="text-sm text-muted-foreground">{council.run.error_message}</p>
            ) : null}
            <div className="grid gap-2 text-sm">
              {council.run.failed_step ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Step:</span>
                  <Badge variant="outline">{council.run.failed_step}</Badge>
                </div>
              ) : null}
              {council.run.failed_round ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Round:</span>
                  <Badge variant="outline">{council.run.failed_round}</Badge>
                </div>
              ) : null}
              {council.run.failed_agent ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Agent:</span>
                  <Badge variant="outline">{council.run.failed_agent}</Badge>
                </div>
              ) : null}
              {council.run.failed_provider ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Provider:</span>
                  <Badge variant="outline">{council.run.failed_provider}</Badge>
                </div>
              ) : null}
              {council.run.failed_model ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Model:</span>
                  <Badge variant="outline">{council.run.failed_model}</Badge>
                </div>
              ) : null}
              {council.run.failed_at ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Failed at:</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(council.run.failed_at)}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/api/health/models" target="_blank">
                  Check model health
                </Link>
              </Button>
            </div>
            {council.run.debug_trace && Array.isArray(council.run.debug_trace) && council.run.debug_trace.length > 0 ? (
              <Collapsible className="mt-2">
                <CollapsibleTrigger>
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer">
                    <ChevronRight className="size-4" />
                    Debug trace
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-2 rounded-md border bg-background/50 p-3">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {council.run.debug_trace.map((event: any, idx: number) => {
                      const time = typeof event.time === "string" ? new Date(event.time).toLocaleTimeString() : "";
                      const status = String(event.status ?? "");
                      const step = String(event.step ?? "");
                      const round = event.round ? String(event.round) : null;
                      const agent = event.agent ? String(event.agent) : null;
                      const provider = event.provider ? String(event.provider) : null;
                      const model = event.model ? String(event.model) : null;
                      return (
                        <div key={idx} className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{time}</span>
                            <Badge
                              variant={
                                status === "failed"
                                  ? "danger"
                                  : status === "ok" || status === "fallback"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {status}
                            </Badge>
                            <span className="font-medium">{step}</span>
                          </div>
                          {round ? <div className="pl-2 text-muted-foreground">Round: {round}</div> : null}
                          {agent ? <div className="pl-2 text-muted-foreground">Agent: {agent}</div> : null}
                          {provider ? <div className="pl-2 text-muted-foreground">Provider: {provider}</div> : null}
                          {model ? <div className="pl-2 text-muted-foreground">Model: {model}</div> : null}
                          {event.details ? (
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-[10px]">
                              {JSON.stringify(event.details, null, 2)}
                            </pre>
                          ) : null}
                          {event.error ? (
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-destructive/10 p-2 text-[10px] text-destructive">
                              {JSON.stringify(event.error, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </div>
        </section>
      ) : spotlightIdea ? (
        <section className="rounded-lg border border-secondary/40 bg-secondary/12 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-secondary">
                <Trophy className="size-4" aria-hidden="true" />
                {finalDecision === "validate_first"
                  ? "Validate first / Do not build yet"
                  : finalDecision === "reject_all"
                    ? "Reject all"
                    : winner
                      ? "Build now"
                      : "Top scored candidate"}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-normal">
                {spotlightIdea.title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {spotlightIdea.why_buy_source_code}
              </p>
            </div>
            <div className="rounded-lg border border-secondary/30 bg-background/45 px-5 py-4 text-center">
              <p className="text-xs uppercase text-muted-foreground">
                Day-One Sale Probability
              </p>
              <p className="mt-1 text-3xl font-semibold text-secondary">
                {dayOneSaleProbability ?? "?"}/100
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
              Scored from 0-10 across ten Day-One sale probability criteria.
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
