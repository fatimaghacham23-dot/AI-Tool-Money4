import {
  BadgeDollarSign,
  BriefcaseBusiness,
  Code2,
  Hammer,
  PackageSearch,
  RadioTower,
  Scale,
  SearchCheck,
  ShieldAlert,
  MessageCircleQuestion,
  Sparkles,
} from "lucide-react";

import type { CouncilAgent } from "@/ai/types";
import { cn } from "@/lib/utils";

const iconMap = {
  PackageSearch,
  RadioTower,
  SearchCheck,
  MessageCircleQuestion,
  Code2,
  BriefcaseBusiness,
  ShieldAlert,
  Hammer,
  BadgeDollarSign,
  Scale,
};

const colorMap = {
  teal: "border-teal-400/35 bg-teal-400/15 text-teal-100",
  amber: "border-amber-400/35 bg-amber-400/15 text-amber-100",
  cyan: "border-cyan-400/35 bg-cyan-400/15 text-cyan-100",
  rose: "border-rose-400/35 bg-rose-400/15 text-rose-100",
  red: "border-red-400/35 bg-red-400/15 text-red-100",
  emerald: "border-emerald-400/35 bg-emerald-400/15 text-emerald-100",
  violet: "border-violet-400/35 bg-violet-400/15 text-violet-100",
  fuchsia: "border-fuchsia-400/35 bg-fuchsia-400/15 text-fuchsia-100",
  blue: "border-blue-400/35 bg-blue-400/15 text-blue-100",
  orange: "border-orange-400/35 bg-orange-400/15 text-orange-100",
};

export function AgentIcon({
  agent,
  className,
}: {
  agent?: Pick<CouncilAgent, "icon" | "color"> | null;
  className?: string;
}) {
  const Icon = agent?.icon
    ? iconMap[agent.icon as keyof typeof iconMap] ?? Sparkles
    : Sparkles;
  const color = agent?.color
    ? colorMap[agent.color as keyof typeof colorMap]
    : "border-border bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-md border",
        color,
        className,
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}
