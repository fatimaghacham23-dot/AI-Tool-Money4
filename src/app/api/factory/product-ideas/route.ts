import { NextResponse } from "next/server";

import { listAllProductIdeas } from "@/lib/data/factory";
import type { FactoryFilters } from "@/lib/data/types";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const filters: FactoryFilters = {
    status: (searchParams.get("status") as FactoryFilters["status"]) ?? "all",
    buyerType: searchParams.get("buyerType") ?? "all",
    scoreRange:
      (searchParams.get("scoreRange") as FactoryFilters["scoreRange"]) ?? "all",
    evidenceBackedOnly: searchParams.get("evidenceBackedOnly") === "true",
    highLinkedInVirality: searchParams.get("highLinkedInVirality") === "true",
    fastBuildOnly: searchParams.get("fastBuildOnly") === "true",
    highPricePotential: searchParams.get("highPricePotential") === "true",
  };
  const ideas = await listAllProductIdeas(filters);

  return NextResponse.json({ ideas });
}
