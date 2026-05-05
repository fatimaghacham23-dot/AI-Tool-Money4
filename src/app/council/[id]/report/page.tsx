import { ChevronLeft, ClipboardCheck, MessageSquareText, Trophy } from "lucide-react";
import Link from "next/link";

import { MarkdownReport } from "@/components/council/markdown-report";
import { ReportCopyActions } from "@/components/council/report-copy-actions";
import { ScoreTable } from "@/components/council/score-table";
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

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const council = await getCouncilRun(id);
  const report = council.report;
  const evidenceBacked =
    council.marketEvidence.length > 0 ||
    Boolean(council.run.market_evidence_notes?.trim());

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href={`/council/${id}`}>
              <ChevronLeft aria-hidden="true" />
              Overview
            </Link>
          </Button>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">
            Final Report
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            One winning full-source-code product, with build plan and sales assets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/council/${id}/debate`}>
              <MessageSquareText aria-hidden="true" />
              Debate transcript
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/council/${id}/execution`}>
              <ClipboardCheck aria-hidden="true" />
              Open Execution Plan
            </Link>
          </Button>
        </div>
      </div>

      {council.winner ? (
        <section className="rounded-lg border border-secondary/40 bg-secondary/12 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-secondary">
                <Trophy className="size-4" aria-hidden="true" />
                Build this first
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-normal">
                {council.winner.title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {council.winner.description}
              </p>
            </div>
            <div className="rounded-lg border border-secondary/30 bg-background/45 px-6 py-5 text-center">
              <p className="text-xs uppercase text-muted-foreground">Score</p>
              <p className="mt-1 text-4xl font-semibold text-secondary">
                {council.winner.score?.total_score ?? "?"}/100
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Score Breakdown</CardTitle>
          <CardDescription>The final shortlist ranked by the council rubric.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScoreTable ideas={council.ideas} />
        </CardContent>
      </Card>

      {report ? (
        <>
          <Card className={evidenceBacked ? "border-primary/35" : "border-amber-400/35"}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Market Evidence Used</CardTitle>
                <Badge variant={evidenceBacked ? "success" : "warning"}>
                  {evidenceBacked ? "Evidence-backed" : "Assumption-heavy"}
                </Badge>
              </div>
              <CardDescription>
                Evidence is used by the debate, scoring rationale, final report, and
                validation checklist.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {council.marketEvidence.length ? (
                council.marketEvidence.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border bg-background/40 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="mt-1 text-xs uppercase text-muted-foreground">
                          {item.source_type} / {item.signal_type}
                        </p>
                      </div>
                      <Badge variant="muted">{item.strength_score}/10 strength</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {item.content}
                    </p>
                    {item.source_url ? (
                      <a
                        href={item.source_url}
                        className="mt-3 inline-block text-sm text-primary hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open source
                      </a>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  No structured evidence was attached to this run. The report marks
                  buyer demand and willingness-to-pay assumptions as needing manual
                  validation before Ahmad commits more than two days of build time.
                </p>
              )}
            </CardContent>
          </Card>

          <ReportCopyActions
            reportMarkdown={report.report_markdown}
            linkedinPost={report.linkedin_post}
            dmScript={report.dm_script}
          />

          <MarkdownReport markdown={report.report_markdown} />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>LinkedIn Launch Post</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                  {report.linkedin_post}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>DM Sales Script</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                  {report.dm_script}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Demo Video Script</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                  {report.demo_video_script}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            The final report will appear after Round 7 completes.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
