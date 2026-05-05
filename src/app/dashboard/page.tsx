import { ArrowRight, PlusCircle, Trophy } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/council/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardRuns } from "@/lib/data/council";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const runs = await getDashboardRuns();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Private product strategy room</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal md:text-4xl">
            Ahmad Product Council
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Run structured AI debates to choose one full-source-code product to build,
            package, and sell from LinkedIn.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/new-council">
            <PlusCircle aria-hidden="true" />
            New council run
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total runs</CardDescription>
            <CardTitle className="text-3xl">{runs.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Completed decisions</CardDescription>
            <CardTitle className="text-3xl">
              {runs.filter((run) => run.status === "completed").length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Best current score</CardDescription>
            <CardTitle className="text-3xl">
              {Math.max(...runs.map((run) => run.totalScore ?? 0), 0)}/100
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Council Runs</CardTitle>
          <CardDescription>
            Previous debates, winners, total score, and report status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Run</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Winner</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-t border-border">
                      <td className="max-w-[260px] px-4 py-4 font-medium">{run.title}</td>
                      <td className="px-4 py-4">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {run.winnerProduct ? (
                          <span className="inline-flex items-center gap-2 text-foreground">
                            <Trophy className="size-4 text-secondary" aria-hidden="true" />
                            {run.winnerProduct}
                          </span>
                        ) : (
                          "Pending"
                        )}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {run.totalScore ? `${run.totalScore}/100` : "Pending"}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {formatDate(run.createdAt)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/council/${run.id}`}>
                            <ArrowRight aria-hidden="true" />
                            Open
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No council runs yet. Start one and let the agents debate.
              </p>
              <Button asChild className="mt-4">
                <Link href="/new-council">
                  <PlusCircle aria-hidden="true" />
                  Create first run
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
