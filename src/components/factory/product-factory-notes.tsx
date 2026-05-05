"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FACTORY_STATUS_OPTIONS,
  factoryStatusLabel,
} from "@/lib/data/factory-utils";
import type { FactoryStatus } from "@/lib/data/types";

export function ProductFactoryNotes({
  productIdeaId,
  initialStatus,
  initialNotes,
  initialRejectedReason,
}: {
  productIdeaId: string;
  initialStatus: FactoryStatus;
  initialNotes: string | null;
  initialRejectedReason: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [rejectedReason, setRejectedReason] = useState(initialRejectedReason ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const response = await fetch(`/api/product-ideas/${productIdeaId}/factory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factoryStatus: status,
          notes: notes.trim() || null,
          rejectedReason: rejectedReason.trim() || null,
        }),
      });

      if (response.ok) {
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">Factory State</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Current status: {factoryStatusLabel(initialStatus)}
          </p>
        </div>
        <Button type="button" onClick={save} disabled={isPending}>
          <Save aria-hidden="true" />
          {isPending ? "Saving" : "Save"}
        </Button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[240px_1fr_1fr]">
        <label className="block">
          <span className="text-xs uppercase text-muted-foreground">Status</span>
          <Select
            value={status}
            className="mt-2"
            onChange={(event) => setStatus(event.currentTarget.value as FactoryStatus)}
          >
            {FACTORY_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="text-xs uppercase text-muted-foreground">Notes</span>
          <Textarea
            value={notes}
            className="mt-2 min-h-28"
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase text-muted-foreground">Rejected reason</span>
          <Textarea
            value={rejectedReason}
            className="mt-2 min-h-28"
            onChange={(event) => setRejectedReason(event.currentTarget.value)}
          />
        </label>
      </div>
    </section>
  );
}
