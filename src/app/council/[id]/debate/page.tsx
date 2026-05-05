import { ChevronLeft, FileText } from "lucide-react";
import Link from "next/link";

import { AgentIcon } from "@/components/council/agent-icon";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCouncilRun } from "@/lib/data/council";

export default async function DebatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const council = await getCouncilRun(id);

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
            Council Debate
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Messages are grouped by debate round so the decision trail stays auditable.
          </p>
        </div>
        <Button asChild>
          <Link href={`/council/${id}/report`}>
            <FileText aria-hidden="true" />
            Final report
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          {council.agents.map((agent) => (
            <Card key={agent.key} className="shadow-none">
              <CardContent className="flex gap-3 p-4">
                <AgentIcon agent={agent} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{agent.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {agent.role}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-5">
          {council.rounds.map((round) => (
            <Card key={round.id}>
              <CardHeader>
                <CardTitle>{round.title}</CardTitle>
                <CardDescription>{round.round_type.replaceAll("_", " ")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {round.messages.length ? (
                  round.messages.map((message) => (
                    <article
                      key={message.id}
                      className="rounded-lg border border-border bg-background/45 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <AgentIcon agent={message.agent} className="size-9" />
                        <div>
                          <p className="text-sm font-semibold">
                            {message.agent?.name ?? "Council system"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {message.agent?.role ?? "Automated debate event"}
                          </p>
                        </div>
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
          ))}
        </div>
      </div>
    </div>
  );
}
