"use client";

import {
  AlertTriangle,
  ClipboardCheck,
  Factory,
  FileText,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { StatusBadge } from "@/components/council/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CouncilRunStatus } from "@/types/database";

type LiveMessage = {
  id: string;
  roundId: string;
  agentName: string;
  agentRole: string;
  provider: string | null;
  model: string | null;
  content: string;
  createdAt: string;
};

type LiveRound = {
  id: string;
  roundNumber: number;
  roundType: string;
  title: string;
  createdAt: string;
  messages: LiveMessage[];
};

export type CouncilRunStatusPayload = {
  id: string;
  status: CouncilRunStatus;
  current_round: string | null;
  current_agent: string | null;
  current_step: string | null;
  current_provider: string | null;
  current_model: string | null;
  progress_percent: number | null;
  error_message?: string | null;
  failed_step?: string | null;
  failed_round?: string | null;
  failed_agent?: string | null;
  failed_provider?: string | null;
  failed_model?: string | null;
  debug_trace?: unknown;
  rounds: LiveRound[];
  messages: LiveMessage[];
  productIdeasCount: number;
  scoresCount: number;
  hasFinalReport: boolean;
};

export function LiveDebateProgress({
  runId,
  initialStatus,
}: {
  runId: string;
  initialStatus: CouncilRunStatusPayload;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const hasStartedRef = useRef(false);
  const shouldPoll = status.status === "draft" || status.status === "running";

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/council-runs/${runId}/status?ts=${Date.now()}`, {
        cache: "no-store",
      });

      if (response.ok) {
        setStatus((await response.json()) as CouncilRunStatusPayload);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [runId]);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    if (
      (status.status === "draft" || status.status === "running") &&
      status.messages.length === 0 &&
      status.productIdeasCount === 0
    ) {
      hasStartedRef.current = true;
      void fetch(`/api/council-runs/${runId}/run`, { method: "POST" })
        .then(async (response) => {
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: string } | null;
            setStartError(body?.error ?? "Could not start the council debate.");
          }
        })
        .catch((error: unknown) => {
          setStartError(error instanceof Error ? error.message : "Could not start the council debate.");
        });
    }
  }, [runId, status.messages.length, status.productIdeasCount, status.status]);

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    const timer = window.setInterval(() => {
      void refresh();
    }, 2000);

    return () => window.clearInterval(timer);
  }, [refresh, shouldPoll]);

  const progress = Math.max(0, Math.min(100, status.progress_percent ?? 0));
  const latestMessages = status.messages.slice(-8).reverse();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={status.status} />
                {shouldPoll ? (
                  <Badge variant="warning" className="gap-1">
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    Council is debating
                  </Badge>
                ) : null}
                {status.current_model ? (
                  <Badge variant="outline">{status.current_model}</Badge>
                ) : null}
              </div>
              <CardTitle className="mt-4 text-2xl">Live Council Progress</CardTitle>
              <CardDescription className="mt-2">
                {status.current_step ?? "Preparing the council debate."}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCw className={isRefreshing ? "animate-spin" : ""} aria-hidden="true" />
              Refresh
            </Button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <StatusMetric label="Round" value={status.current_round ?? "Queued"} />
          <StatusMetric label="Agent" value={status.current_agent ?? "Council"} />
          <StatusMetric label="Provider" value={status.current_provider ?? "Pending"} />
          <StatusMetric label="Progress" value={`${progress}%`} />
        </CardContent>
      </Card>

      {startError ? (
        <section className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          {startError}
        </section>
      ) : null}

      {status.status === "failed" ? (
        <section className="rounded-lg border border-destructive/40 bg-destructive/12 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Council run failed
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {status.error_message ?? "The council failed while running."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {status.failed_step ? <Badge variant="outline">Step: {status.failed_step}</Badge> : null}
            {status.failed_round ? <Badge variant="outline">Round: {status.failed_round}</Badge> : null}
            {status.failed_agent ? <Badge variant="outline">Agent: {status.failed_agent}</Badge> : null}
            {status.failed_model ? <Badge variant="outline">Model: {status.failed_model}</Badge> : null}
          </div>
        </section>
      ) : null}

      {status.status === "completed" ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/council/${runId}/report`}>
              <FileText aria-hidden="true" />
              View Report
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/council/${runId}/execution`}>
              <ClipboardCheck aria-hidden="true" />
              Open Execution Plan
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/factory">
              <Factory aria-hidden="true" />
              Open Factory
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Live Event Feed</CardTitle>
            <CardDescription>Latest generated model messages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestMessages.length ? (
              latestMessages.map((message) => (
                <article key={message.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Send className="size-4 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{message.agentName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {message.provider ?? "provider"} / {message.model ?? "model"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                    {message.content}
                  </p>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Waiting for the first council message.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {status.rounds.length ? (
            status.rounds.map((round) => (
              <Card key={round.id}>
                <CardHeader>
                  <CardTitle>{round.title}</CardTitle>
                  <CardDescription>{round.roundType.replaceAll("_", " ")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {round.messages.length ? (
                    round.messages.map((message) => (
                      <article
                        key={message.id}
                        className="rounded-lg border border-border bg-background/45 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold">{message.agentName}</p>
                            <p className="text-xs text-muted-foreground">{message.agentRole}</p>
                          </div>
                          <Badge variant="muted">
                            {message.provider ?? "provider"} / {message.model ?? "model"}
                          </Badge>
                        </div>
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                          {message.content}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This round has not produced messages yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                The council run is queued. Round 1 will appear here as soon as the first model response is saved.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}
