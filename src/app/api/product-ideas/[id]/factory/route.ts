import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getProductDetailWithContext,
  updateFactoryStatus,
} from "@/lib/data/factory";

const updateFactorySchema = z.object({
  factoryStatus: z
    .enum([
      "generated",
      "shortlisted",
      "winner",
      "validating",
      "building",
      "packaged",
      "launched",
      "sold",
      "rejected",
      "watchlist",
    ])
    .optional(),
  watchlisted: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  rejectedReason: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detail = await getProductDetailWithContext(id);

  if (!detail) {
    return NextResponse.json({ error: "Product idea not found." }, { status: 404 });
  }

  return NextResponse.json({ detail });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json();
  const parsed = updateFactorySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid product factory update.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const idea = await updateFactoryStatus(id, parsed.data);
    return NextResponse.json({ idea });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update product idea.";
    const status = message.includes("Authentication") ? 401 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
