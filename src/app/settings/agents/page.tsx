import { DEFAULT_AGENTS, mergeAgentsFromDatabase } from "@/ai/agents";
import { AgentSettingsForm } from "@/components/settings/agent-settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function AgentSettingsPage() {
  const agents = await getAgents();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Agent settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">
          Council roles and prompts
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Tune each simulated agent. GitHub Models is the primary provider, with OpenAI and demo fallback modes available.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider architecture</CardTitle>
          <CardDescription>
            The current implementation uses OpenAI only, but agents store provider
            and model names independently for future Claude, Gemini, Mistral,
            DeepSeek, Grok, or local model adapters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Edit prompts carefully: the Judge Agent must always choose one product
            only and clearly say &quot;Build this first.&quot;
          </p>
        </CardContent>
      </Card>

      <AgentSettingsForm agents={agents} />
    </div>
  );
}

async function getAgents() {
  if (!hasSupabaseEnv()) {
    return DEFAULT_AGENTS;
  }

  const supabase = await createClient();
  if (!supabase) {
    return DEFAULT_AGENTS;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return DEFAULT_AGENTS;
  }

  const { data } = await supabase.from("agents").select("*").order("created_at");
  return mergeAgentsFromDatabase(data);
}
