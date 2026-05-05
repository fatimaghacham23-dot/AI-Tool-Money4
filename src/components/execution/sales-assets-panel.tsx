"use client";

import { Check, Clipboard, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SalesAssetRow } from "@/types/database";

export function SalesAssetsPanel({
  planId,
  assets,
}: {
  planId: string;
  assets: SalesAssetRow[];
}) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function copy(asset: SalesAssetRow) {
    await navigator.clipboard.writeText(asset.content);
    setCopiedId(asset.id);
    window.setTimeout(() => setCopiedId(null), 1400);
  }

  function regenerate() {
    startTransition(async () => {
      await fetch(`/api/execution-plans/${planId}/sales-assets/regenerate`, {
        method: "POST",
      });
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">Sales Assets</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Copy-ready messages for launch, comments, DMs, pricing, and license clarity.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={regenerate}
          disabled={isPending}
        >
          <RefreshCw aria-hidden="true" />
          {isPending ? "Regenerating" : "Regenerate assets"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="rounded-lg border border-border bg-background/35 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge variant="muted">{asset.asset_type.replaceAll("_", " ")}</Badge>
                <h3 className="mt-3 text-base font-semibold tracking-normal">
                  {asset.title}
                </h3>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => copy(asset)}>
                {copiedId === asset.id ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Clipboard aria-hidden="true" />
                )}
                {copiedId === asset.id ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
              {asset.content}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
