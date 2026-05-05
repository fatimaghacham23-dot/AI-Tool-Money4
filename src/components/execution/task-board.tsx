"use client";

import { Ban, CheckCircle2, CircleDashed, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ExecutionTaskRow, ExecutionTaskStatus } from "@/types/database";

const PHASES = ["Validation", "Build", "Packaging", "LinkedIn Launch"];

export function TaskBoard({ tasks }: { tasks: ExecutionTaskRow[] }) {
  return (
    <div className="space-y-5">
      {PHASES.map((phase) => {
        const phaseTasks = tasks.filter((task) => task.phase === phase);

        if (!phaseTasks.length) {
          return null;
        }

        return <TaskPhase key={phase} phase={phase} tasks={phaseTasks} />;
      })}
    </div>
  );
}

function TaskPhase({
  phase,
  tasks,
}: {
  phase: string;
  tasks: ExecutionTaskRow[];
}) {
  const completed = tasks.filter((task) => task.status === "done").length;

  return (
    <section className="rounded-lg border border-border bg-background/35">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-normal">{phase}</h2>
          <p className="text-sm text-muted-foreground">
            {completed}/{tasks.length} tasks complete
          </p>
        </div>
        <Badge variant={completed === tasks.length ? "success" : "muted"}>
          {completed === tasks.length ? "Complete" : "In progress"}
        </Badge>
      </div>
      <div className="divide-y divide-border">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </section>
  );
}

function TaskRow({ task }: { task: ExecutionTaskRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(task.status);

  function updateStatus(nextStatus: ExecutionTaskStatus) {
    setStatus(nextStatus);

    startTransition(async () => {
      const response = await fetch(`/api/execution-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        setStatus(task.status);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_210px] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={status} />
          <PriorityPill priority={task.priority} />
          <Badge variant="outline">{task.due_day}</Badge>
        </div>
        <h3 className="mt-3 text-sm font-semibold tracking-normal">{task.title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {task.description}
        </p>
      </div>
      <div>
        <label className="text-xs uppercase text-muted-foreground" htmlFor={task.id}>
          Status
        </label>
        <Select
          id={task.id}
          value={status}
          disabled={isPending}
          className="mt-2"
          onChange={(event) =>
            updateStatus(event.currentTarget.value as ExecutionTaskStatus)
          }
        >
          <option value="todo">Todo</option>
          <option value="doing">Doing</option>
          <option value="done">Done</option>
          <option value="skipped">Skipped</option>
        </Select>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ExecutionTaskStatus }) {
  const config = {
    todo: {
      label: "Todo",
      variant: "muted" as const,
      icon: CircleDashed,
    },
    doing: {
      label: "Doing",
      variant: "warning" as const,
      icon: PlayCircle,
    },
    done: {
      label: "Done",
      variant: "success" as const,
      icon: CheckCircle2,
    },
    skipped: {
      label: "Skipped",
      variant: "outline" as const,
      icon: Ban,
    },
  }[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1.5">
      <Icon className="size-3.5" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}

function PriorityPill({ priority }: { priority: ExecutionTaskRow["priority"] }) {
  return (
    <Badge
      variant={
        priority === "high" ? "danger" : priority === "medium" ? "warning" : "muted"
      }
      className={cn(priority === "low" && "text-muted-foreground")}
    >
      {priority} priority
    </Badge>
  );
}
