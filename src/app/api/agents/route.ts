import { NextResponse } from "next/server";
import { z } from "zod";

import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const updateAgentsSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(2),
      role: z.string().min(5),
      systemPrompt: z.string().min(20),
      modelProvider: z.string().min(2),
      modelName: z.string().min(2),
      enabled: z.boolean(),
    }),
  ),
});

export async function PATCH(request: Request) {
  const body = await request.json();
  const parsed = updateAgentsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid agent payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!hasSupabaseEnv()) {
    return NextResponse.json({
      ok: true,
      demo: true,
      message: "Supabase env vars are missing, so edits were not persisted.",
    });
  }

  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const results = await Promise.all(
    parsed.data.agents.map((agent) =>
      supabase
        .from("agents")
        .update({
          role: agent.role,
          system_prompt: agent.systemPrompt,
          model_provider: agent.modelProvider,
          model_name: agent.modelName,
          enabled: agent.enabled,
        })
        .eq("id", agent.id),
    ),
  );

  const error = results.find((result) => result.error)?.error;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
