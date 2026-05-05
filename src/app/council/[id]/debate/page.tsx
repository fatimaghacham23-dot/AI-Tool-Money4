import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import {
  LiveDebateProgress,
  type CouncilRunStatusPayload,
} from "@/components/council/live-debate-progress";
import { Button } from "@/components/ui/button";
import { getCouncilRun } from "@/lib/data/council";

export default async function DebatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const council = await getCouncilRun(id);
  const initialStatus: CouncilRunStatusPayload = {
    id: council.run.id,
    status: council.run.status,
    current_round: council.run.current_round,
    current_agent: council.run.current_agent,
    current_step: council.run.current_step,
    current_provider: council.run.current_provider,
    current_model: council.run.current_model,
    progress_percent: council.run.progress_percent,
    error_message: council.run.error_message,
    failed_step: council.run.failed_step,
    failed_round: council.run.failed_round,
    failed_agent: council.run.failed_agent,
    failed_provider: council.run.failed_provider,
    failed_model: council.run.failed_model,
    debug_trace: council.run.status === "failed" ? council.run.debug_trace : null,
    rounds: council.rounds.map((round) => ({
      id: round.id,
      roundNumber: round.round_number,
      roundType: round.round_type,
      title: round.title,
      createdAt: round.created_at,
      messages: round.messages.map((message) => ({
        id: message.id,
        roundId: message.debate_round_id,
        agentName: message.agent?.name ?? "Council system",
        agentRole: message.agent?.role ?? "Automated debate event",
        provider: message.model_provider ?? message.agent?.modelProvider ?? council.run.current_provider,
        model: message.model_name ?? message.agent?.modelName ?? council.run.current_model,
        content: message.content,
        createdAt: message.created_at,
      })),
    })),
    messages: council.rounds.flatMap((round) =>
      round.messages.map((message) => ({
        id: message.id,
        roundId: message.debate_round_id,
        agentName: message.agent?.name ?? "Council system",
        agentRole: message.agent?.role ?? "Automated debate event",
        provider: message.model_provider ?? message.agent?.modelProvider ?? council.run.current_provider,
        model: message.model_name ?? message.agent?.modelName ?? council.run.current_model,
        content: message.content,
        createdAt: message.created_at,
      })),
    ),
    productIdeasCount: council.ideas.length,
    scoresCount: council.ideas.filter((idea) => idea.score).length,
    hasFinalReport: Boolean(council.report),
  };

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href={`/council/${id}`}>
            <ChevronLeft aria-hidden="true" />
            Overview
          </Link>
        </Button>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal">
          Council Debate
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Watch the seven-round council pipeline as messages, ideas, scores, and failures are saved.
        </p>
      </div>

      <LiveDebateProgress runId={id} initialStatus={initialStatus} />
    </div>
  );
}
