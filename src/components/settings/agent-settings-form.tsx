"use client";

import { Loader2, Save } from "lucide-react";
import { useState } from "react";

import type { CouncilAgent } from "@/ai/types";
import { AgentIcon } from "@/components/council/agent-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AgentSettingsForm({ agents }: { agents: CouncilAgent[] }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canPersist = agents.every((agent) => agent.id);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canPersist) {
      setMessage("Connect Supabase and load seeded agents before saving edits.");
      return;
    }

    setSaving(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: String(form.get(`${agent.key}:role`) ?? agent.role),
        systemPrompt: String(
          form.get(`${agent.key}:systemPrompt`) ?? agent.systemPrompt,
        ),
        modelProvider: String(
          form.get(`${agent.key}:modelProvider`) ?? agent.modelProvider,
        ),
        modelName: String(form.get(`${agent.key}:modelName`) ?? agent.modelName),
        enabled: form.get(`${agent.key}:enabled`) === "on",
      })),
    };

    const response = await fetch("/api/agents", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { error?: string; message?: string };
    setSaving(false);
    setMessage(response.ok ? data.message ?? "Agent settings saved." : data.error ?? "Save failed.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {agents.map((agent) => (
        <Card key={agent.key}>
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <AgentIcon agent={agent} />
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold">{agent.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{agent.role}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      name={`${agent.key}:enabled`}
                      defaultChecked={agent.enabled}
                      className="size-4 accent-primary"
                    />
                    Enabled
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={`${agent.key}:modelProvider`}>Provider</Label>
                    <Select
                      id={`${agent.key}:modelProvider`}
                      name={`${agent.key}:modelProvider`}
                      defaultValue={agent.modelProvider}
                    >
                      <option value="github-models">GitHub Models</option>
                      <option value="openai">OpenAI</option>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${agent.key}:modelName`}>Model</Label>
                    <Select
                      id={`${agent.key}:modelName`}
                      name={`${agent.key}:modelName`}
                      defaultValue={agent.modelName}
                    >
                      <option value="openai/gpt-4o">GPT-4o</option>
                      <option value="openai/gpt-4o-mini">GPT-4o mini</option>
                      <option value="openai/gpt-4.1">GPT-4.1</option>
                      <option value="openai/gpt-4.1-nano">GPT-4.1 nano</option>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`${agent.key}:role`}>Role</Label>
                  <Input
                    id={`${agent.key}:role`}
                    name={`${agent.key}:role`}
                    defaultValue={agent.role}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`${agent.key}:systemPrompt`}>System prompt</Label>
                  <Textarea
                    id={`${agent.key}:systemPrompt`}
                    name={`${agent.key}:systemPrompt`}
                    defaultValue={agent.systemPrompt}
                    className="min-h-32"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {message ? (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}

      <Button type="submit" disabled={saving}>
        {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
        Save agent settings
      </Button>
    </form>
  );
}
