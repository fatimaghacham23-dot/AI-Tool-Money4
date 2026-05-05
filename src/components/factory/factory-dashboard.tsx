"use client";

import {
  ArrowRight,
  ClipboardCheck,
  Eye,
  Factory,
  Gauge,
  Hammer,
  PackageCheck,
  Send,
  Star,
  Trash2,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  createFactoryOverview,
  evidenceStatusLabel,
  evidenceStatusVariant,
  FACTORY_STATUS_OPTIONS,
  factoryStatusLabel,
  filterFactoryProductIdeas,
  getBuyerOptions,
  SCORE_RANGE_OPTIONS,
} from "@/lib/data/factory-utils";
import type {
  FactoryFilters,
  FactoryProductIdea,
  FactoryStatus,
} from "@/lib/data/types";
import { cn, formatDate } from "@/lib/utils";

const defaultFilters: FactoryFilters = {
  status: "all",
  buyerType: "all",
  scoreRange: "all",
  evidenceBackedOnly: false,
  highLinkedInVirality: false,
  fastBuildOnly: false,
  highPricePotential: false,
};

type FactoryAction =
  | { factoryStatus: FactoryStatus; watchlisted?: boolean; rejectedReason?: string }
  | { watchlisted: boolean };

export function FactoryDashboard({
  initialIdeas,
}: {
  initialIdeas: FactoryProductIdea[];
}) {
  const router = useRouter();
  const [ideas, setIdeas] = useState(initialIdeas);
  const [filters, setFilters] = useState<FactoryFilters>(defaultFilters);
  const [isPending, startTransition] = useTransition();

  const overview = useMemo(() => createFactoryOverview(ideas), [ideas]);
  const filteredIdeas = useMemo(
    () => filterFactoryProductIdeas(ideas, filters),
    [filters, ideas],
  );
  const buyerOptions = useMemo(() => getBuyerOptions(ideas), [ideas]);

  function setFilter<Key extends keyof FactoryFilters>(
    key: Key,
    value: FactoryFilters[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateIdea(idea: FactoryProductIdea, action: FactoryAction) {
    const optimistic = createOptimisticIdea(idea, action);
    const previousIdeas = ideas;

    setIdeas((current) =>
      current.map((item) => (item.id === idea.id ? optimistic : item)),
    );

    startTransition(async () => {
      const response = await fetch(`/api/product-ideas/${idea.id}/factory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });

      if (!response.ok) {
        setIdeas(previousIdeas);
        return;
      }

      const payload = (await response.json()) as { idea: Partial<FactoryProductIdea> };
      setIdeas((current) =>
        current.map((item) =>
          item.id === idea.id ? ({ ...item, ...payload.idea } as FactoryProductIdea) : item,
        ),
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-primary">Product Factory Mode</p>
          <h1 className="text-3xl font-semibold tracking-normal md:text-4xl">
            Product Factory
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Track every source-code product candidate across council runs, compare
            the signals, and move the best ideas toward validation, build, and sales.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          icon={Factory}
          label="Total product ideas"
          value={overview.totalIdeas}
        />
        <OverviewCard
          icon={Trophy}
          label="Winners selected"
          value={overview.winnersSelected}
        />
        <OverviewCard
          icon={Gauge}
          label="Products in validation"
          value={overview.productsInValidation}
        />
        <OverviewCard
          icon={Hammer}
          label="Products in build"
          value={overview.productsInBuild}
        />
        <OverviewCard
          icon={PackageCheck}
          label="Ready to sell"
          value={overview.productsReadyToSell}
        />
        <OverviewCard
          icon={Star}
          label="Average score"
          value={overview.averageScore === null ? "Pending" : `${overview.averageScore}/100`}
        />
        <OverviewCard
          icon={Trophy}
          label="Highest scoring idea"
          value={
            overview.highestScoringIdea
              ? `${overview.highestScoringIdea.score?.total_score ?? "?"}/100`
              : "Pending"
          }
          detail={overview.highestScoringIdea?.title ?? null}
          wide
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="grid gap-4 lg:grid-cols-4">
          <FilterField label="Status">
            <Select
              value={filters.status ?? "all"}
              onChange={(event) =>
                setFilter("status", event.currentTarget.value as FactoryFilters["status"])
              }
            >
              <option value="all">All statuses</option>
              {FACTORY_STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Buyer type">
            <Select
              value={filters.buyerType ?? "all"}
              onChange={(event) => setFilter("buyerType", event.currentTarget.value)}
            >
              <option value="all">All buyers</option>
              {buyerOptions.map((buyer) => (
                <option key={buyer} value={buyer}>
                  {buyer}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Score range">
            <Select
              value={filters.scoreRange ?? "all"}
              onChange={(event) =>
                setFilter(
                  "scoreRange",
                  event.currentTarget.value as FactoryFilters["scoreRange"],
                )
              }
            >
              {SCORE_RANGE_OPTIONS.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </Select>
          </FilterField>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setFilters(defaultFilters)}
            >
              Reset filters
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FilterToggle
            checked={Boolean(filters.evidenceBackedOnly)}
            label="Evidence-backed only"
            onChange={(checked) => setFilter("evidenceBackedOnly", checked)}
          />
          <FilterToggle
            checked={Boolean(filters.highLinkedInVirality)}
            label="High LinkedIn virality"
            onChange={(checked) => setFilter("highLinkedInVirality", checked)}
          />
          <FilterToggle
            checked={Boolean(filters.fastBuildOnly)}
            label="Fast build only"
            onChange={(checked) => setFilter("fastBuildOnly", checked)}
          />
          <FilterToggle
            checked={Boolean(filters.highPricePotential)}
            label="High price potential"
            onChange={(checked) => setFilter("highPricePotential", checked)}
          />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-2 border-b border-border p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-normal">
              Product Idea Table
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredIdeas.length} of {ideas.length} ideas shown.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/new-council">
              New council run
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {filteredIdeas.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1520px] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Product name</th>
                  <th className="px-4 py-3">Council run</th>
                  <th className="px-4 py-3">Target buyer</th>
                  <th className="px-4 py-3">Total score</th>
                  <th className="px-4 py-3">Evidence status</th>
                  <th className="px-4 py-3">Execution status</th>
                  <th className="px-4 py-3">Price potential</th>
                  <th className="px-4 py-3">Build speed</th>
                  <th className="px-4 py-3">LinkedIn virality</th>
                  <th className="px-4 py-3">Created date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredIdeas.map((idea) => (
                  <tr key={idea.id} className="border-t border-border align-top">
                    <td className="max-w-[250px] px-4 py-4">
                      <Link
                        href={`/factory/${idea.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {idea.title}
                      </Link>
                      <div className="mt-2">
                        <FactoryStatusPill status={idea.factory_status} />
                      </div>
                    </td>
                    <td className="max-w-[220px] px-4 py-4">
                      <Link
                        href={`/council/${idea.councilRun.id}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {idea.councilRun.title}
                      </Link>
                    </td>
                    <td className="max-w-[230px] px-4 py-4 text-muted-foreground">
                      {idea.target_buyer ?? idea.councilRun.target_buyer ?? "Open"}
                    </td>
                    <td className="px-4 py-4 font-medium">
                      {idea.score ? `${idea.score.total_score}/100` : "Pending"}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={evidenceStatusVariant(idea.evidenceStatus)}>
                        {evidenceStatusLabel(idea.evidenceStatus)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {idea.executionPlan?.status.replaceAll("_", " ") ?? "No plan"}
                    </td>
                    <ScoreCell value={idea.score?.price_potential ?? null} />
                    <ScoreCell value={idea.score?.build_speed ?? null} />
                    <ScoreCell value={idea.score?.linkedin_virality ?? null} />
                    <td className="px-4 py-4 text-muted-foreground">
                      {formatDate(idea.created_at)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex max-w-[360px] flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/council/${idea.councilRun.id}/report`}>
                            <Eye aria-hidden="true" />
                            Report
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/council/${idea.councilRun.id}/execution`}>
                            <ClipboardCheck aria-hidden="true" />
                            Plan
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            updateIdea(idea, {
                              factoryStatus: "watchlist",
                              watchlisted: true,
                            })
                          }
                        >
                          <Star aria-hidden="true" />
                          Watch
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            updateIdea(idea, {
                              factoryStatus: "rejected",
                              rejectedReason:
                                idea.rejected_reason ?? "Rejected from Product Factory.",
                            })
                          }
                        >
                          <Trash2 aria-hidden="true" />
                          Reject
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => updateIdea(idea, { factoryStatus: "packaged" })}
                        >
                          <Hammer aria-hidden="true" />
                          Built
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => updateIdea(idea, { factoryStatus: "launched" })}
                        >
                          <Send aria-hidden="true" />
                          Ready
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No product ideas match the current filters.
          </div>
        )}
      </section>
    </div>
  );
}

function OverviewCard({
  icon: Icon,
  label,
  value,
  detail,
  wide,
}: {
  icon: typeof Factory;
  label: string;
  value: string | number;
  detail?: string | null;
  wide?: boolean;
}) {
  return (
    <Card className={cn(wide && "md:col-span-2")}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardDescription>{label}</CardDescription>
          <Icon className="size-4 text-primary" aria-hidden="true" />
        </div>
        <CardTitle className="text-3xl">{value}</CardTitle>
        {detail ? (
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </CardHeader>
    </Card>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function FilterToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-11 items-center gap-3 rounded-md border border-border bg-background/35 px-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        className="size-4 accent-primary"
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function FactoryStatusPill({ status }: { status: FactoryStatus }) {
  const variant =
    status === "sold" || status === "launched"
      ? "success"
      : status === "rejected"
        ? "danger"
        : status === "building" || status === "validating"
          ? "warning"
          : status === "winner" || status === "packaged"
            ? "secondary"
            : "muted";

  return <Badge variant={variant}>{factoryStatusLabel(status)}</Badge>;
}

function ScoreCell({ value }: { value: number | null }) {
  return (
    <td className="px-4 py-4 text-muted-foreground">
      {value === null ? "Pending" : `${value}/10`}
    </td>
  );
}

function createOptimisticIdea(
  idea: FactoryProductIdea,
  action: FactoryAction,
): FactoryProductIdea {
  const now = new Date().toISOString();
  const factoryStatus =
    "factoryStatus" in action ? action.factoryStatus : idea.factory_status;

  return {
    ...idea,
    factory_status: factoryStatus,
    watchlisted:
      "watchlisted" in action
        ? Boolean(action.watchlisted)
        : factoryStatus === "watchlist"
          ? true
          : factoryStatus === "rejected"
            ? false
            : idea.watchlisted,
    built_at: factoryStatus === "packaged" ? now : idea.built_at,
    launched_at: factoryStatus === "launched" ? now : idea.launched_at,
    sold_at: factoryStatus === "sold" ? now : idea.sold_at,
    rejected_reason:
      "rejectedReason" in action ? action.rejectedReason ?? null : idea.rejected_reason,
  };
}
