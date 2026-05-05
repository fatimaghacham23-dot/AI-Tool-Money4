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
import type { PreSellPack } from "@/ai/types";
import type { FinalDecision, Json } from "@/types/database";

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
  const topScoredIdea = [...council.ideas]
    .filter((idea) => idea.score)
    .sort((a, b) => (b.score?.total_score ?? 0) - (a.score?.total_score ?? 0))[0] ?? null;
  const spotlightIdea = council.winner ?? topScoredIdea;
  const finalDecision =
    report?.final_decision ?? (council.winner ? "build_now" : null);
  const dayOneSaleProbability =
    report?.day_one_sale_probability ?? spotlightIdea?.score?.total_score ?? null;
  const preSellPack = readPreSellPack(report?.pre_sell_pack);

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
            The build gate decision, Day-One Sale Probability, and sales validation assets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/council/${id}/debate`}>
              <MessageSquareText aria-hidden="true" />
              Debate transcript
            </Link>
          </Button>
          {council.winner ? (
            <Button asChild>
              <Link href={`/council/${id}/execution`}>
                <ClipboardCheck aria-hidden="true" />
                Open Execution Plan
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {spotlightIdea ? (
        <section className="rounded-lg border border-secondary/40 bg-secondary/12 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-secondary">
                <Trophy className="size-4" aria-hidden="true" />
                {finalDecision ? decisionHeading(finalDecision) : "Top scored candidate"}
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-normal">
                {spotlightIdea.title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {spotlightIdea.description}
              </p>
            </div>
            <div className="rounded-lg border border-secondary/30 bg-background/45 px-6 py-5 text-center">
              <p className="text-xs uppercase text-muted-foreground">
                Day-One Sale Probability
              </p>
              <p className="mt-1 text-4xl font-semibold text-secondary">
                {dayOneSaleProbability ?? "?"}/100
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Score Breakdown</CardTitle>
          <CardDescription>
            The final shortlist ranked by Day-One Sale Probability.
          </CardDescription>
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
            preSellPack={preSellPack}
          />

          {preSellPack ? <PreSellPackSection pack={preSellPack} /> : null}

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

function decisionHeading(decision: FinalDecision) {
  switch (decision) {
    case "build_now":
      return "Build now";
    case "reject_all":
      return "Reject all";
    case "validate_first":
    default:
      return "Validate first / Do not build yet";
  }
}

function PreSellPackSection({ pack }: { pack: PreSellPack }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-5">
        <h2 className="text-xl font-semibold tracking-normal">Pre-Sell Pack</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Validation copy and go/no-go assets for fast buyer signal before build time.
        </p>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <AssetBlock title="LinkedIn Validation Post" value={pack.validationPost} />
        <AssetBlock title="Teaser Post" value={pack.teaserPost} />
        <AssetBlock title="DM Reply" value={pack.dmReply} />
        <AssetBlock title="Follow-Up DM" value={pack.followUpDm} />
        <AssetBlock title="Payment Link Message" value={pack.paymentLinkMessage} />
        <AssetBlock title="30-Second Demo Script" value={pack.demoScript30s} />
        <div className="rounded-lg border border-border bg-background/35 p-4">
          <h3 className="font-semibold tracking-normal">Screenshot Checklist</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            {pack.screenshotChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <AssetBlock title="Go/No-Go Threshold" value={pack.goNoGoRule} />
      </div>
    </section>
  );
}

function AssetBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/35 p-4">
      <h3 className="font-semibold tracking-normal">{title}</h3>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
        {value}
      </p>
    </div>
  );
}

function readPreSellPack(value: Json | undefined): PreSellPack | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, Json | undefined>;
  const screenshotChecklist = Array.isArray(candidate.screenshotChecklist)
    ? candidate.screenshotChecklist.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : [];

  const pack = {
    validationPost: readString(candidate.validationPost),
    teaserPost: readString(candidate.teaserPost),
    dmReply: readString(candidate.dmReply),
    followUpDm: readString(candidate.followUpDm),
    paymentLinkMessage: readString(candidate.paymentLinkMessage),
    screenshotChecklist,
    demoScript30s: readString(candidate.demoScript30s),
    goNoGoRule: readString(candidate.goNoGoRule),
  };

  return Object.values(pack).some((item) =>
    Array.isArray(item) ? item.length > 0 : item.length > 0,
  )
    ? pack
    : null;
}

function readString(value: Json | undefined) {
  return typeof value === "string" ? value : "";
}
