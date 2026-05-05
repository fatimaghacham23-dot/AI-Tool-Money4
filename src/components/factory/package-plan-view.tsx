"use client";

import { Check, Clipboard } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Plan = Record<string, string> & { id?: string };

export function PackagePlanView({ productIdeaId, initialStatus }: { productIdeaId: string; initialStatus: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    const res = await fetch(`/api/product-ideas/${productIdeaId}/package/generate`, { method: "POST" });
    const data = await res.json();
    setPlan(data.plan);
  }

  async function copy(key: string) {
    if (!plan?.[key]) return;
    await navigator.clipboard.writeText(plan[key]);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  }

  return (
    <div className="space-y-4">
      {!(["winner", "shortlisted", "watchlist"].includes(initialStatus)) && (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Warning: this idea is not winner/shortlisted/watchlisted yet. You can still generate a package plan.</p>
      )}
      <Button onClick={generate}>Generate Package Plan</Button>
      {plan && (
        <div className="space-y-4">
          {[
            ["package_markdown", "Package Overview"],
            ["readme_markdown", "README Outline"],
            ["quickstart_markdown", "Quickstart Guide"],
            ["license_markdown", "License Tiers"],
            ["sales_page_copy", "Sales Page Copy"],
            ["demo_video_script", "Demo Video Script"],
            ["onboarding_email", "Buyer Onboarding Email"],
          ].map(([key, label]) => (
            <section key={key} className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">{label}</h2>
                <Button variant="outline" size="sm" onClick={() => copy(key)}>
                  {copied === key ? <Check className="size-4" /> : <Clipboard className="size-4" />}
                  Copy
                </Button>
              </div>
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{plan[key]}</pre>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
