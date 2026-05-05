"use client";

import { Loader2, Play, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const defaultGoal =
  "Find me the highest-probability full-source-code product I can build in 7-14 days and sell on LinkedIn.";

export function NewCouncilForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      goal: String(form.get("goal") ?? ""),
      targetBuyer: String(form.get("targetBuyer") ?? ""),
      productCategory: String(form.get("productCategory") ?? ""),
      buildTimeLimit: String(form.get("buildTimeLimit") ?? ""),
      preferredStack: String(form.get("preferredStack") ?? ""),
      minimumPrice: Number(form.get("minimumPrice") ?? 0) || null,
      linkedinAudience: String(form.get("linkedinAudience") ?? ""),
      notes: String(form.get("notes") ?? ""),
      marketEvidenceNotes: String(form.get("marketEvidenceNotes") ?? ""),
    };

    const response = await fetch("/api/council-runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as {
      id?: string;
      error?: string;
    };

    if (!response.ok || !data.id) {
      setError(data.error ?? "Could not create the council run.");
      setSubmitting(false);
      return;
    }

    router.push(`/council/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden="true" />
            Council Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="goal">Goal</Label>
            <Textarea
              id="goal"
              name="goal"
              defaultValue={defaultGoal}
              required
              className="min-h-28"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="targetBuyer">Target buyer</Label>
              <Input
                id="targetBuyer"
                name="targetBuyer"
                placeholder="Agencies, freelancers, technical founders"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="productCategory">Preferred product category</Label>
              <Select id="productCategory" name="productCategory" defaultValue="AI business tools">
                <option>AI micro-SaaS starter kits</option>
                <option>AI client portals</option>
                <option>AI proposal generators</option>
                <option>AI resume analyzers</option>
                <option>AI invoice tools</option>
                <option>AI admin dashboards</option>
                <option>Full-stack templates</option>
                <option>AI business tools</option>
                <option>Agency-resellable products</option>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="buildTimeLimit">Build time limit</Label>
              <Select id="buildTimeLimit" name="buildTimeLimit" defaultValue="7-14 days">
                <option>7 days</option>
                <option>7-14 days</option>
                <option>14 days</option>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="minimumPrice">Minimum selling price</Label>
              <Input
                id="minimumPrice"
                name="minimumPrice"
                type="number"
                min="1"
                defaultValue="199"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="preferredStack">Preferred tech stack</Label>
            <Input
              id="preferredStack"
              name="preferredStack"
              defaultValue="Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Supabase, PostgreSQL, OpenAI"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="linkedinAudience">LinkedIn audience</Label>
            <Input
              id="linkedinAudience"
              name="linkedinAudience"
              placeholder="Software engineers, agency owners, indie hackers"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Constraints, taste, products to avoid, packaging preferences"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="marketEvidenceNotes">Market evidence / observations</Label>
            <Textarea
              id="marketEvidenceNotes"
              name="marketEvidenceNotes"
              className="min-h-36"
              placeholder="Paste Reddit complaints, LinkedIn comments, app reviews, competitor links, buyer messages, or anything that proves demand."
            />
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Creating a run starts the full seven-round debate pipeline.
            </p>
            <Button type="submit" disabled={submitting} size="lg">
              {submitting ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
              {submitting ? "Running council" : "Start council run"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
