import { NextResponse } from "next/server";
import { z } from "zod";

import { updateExecutionTaskStatus } from "@/lib/data/execution";

const updateTaskSchema = z.object({
  status: z.enum(["todo", "doing", "done", "skipped"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json();
  const parsed = updateTaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid task status.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await updateExecutionTaskStatus(id, parsed.data.status);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update execution task.";
    const status = message.includes("Authentication") ? 401 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
