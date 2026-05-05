import { NextResponse } from "next/server";

import { getOrCreateExecutionPlan } from "@/lib/data/execution";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const executionPlan = await getOrCreateExecutionPlan(id);

  if (!executionPlan) {
    return NextResponse.json(
      { error: "Execution plan is not available until the council has a Build now decision at 85+ Day-One Sale Probability." },
      { status: 404 },
    );
  }

  return NextResponse.json(executionPlan);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const executionPlan = await getOrCreateExecutionPlan(id);

  if (!executionPlan) {
    return NextResponse.json(
      { error: "Execution plan is not available until the council has a Build now decision at 85+ Day-One Sale Probability." },
      { status: 404 },
    );
  }

  return NextResponse.json(executionPlan);
}
