import { NextResponse } from "next/server";

import { generatePackagePlan } from "@/ai/package-generator";
import { getProductDetailWithContext } from "@/lib/data/factory";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getProductDetailWithContext(id);
  if (!detail) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const draft = await generatePackagePlan({
    ideaId: id,
    productName: detail.idea.title,
    targetBuyer: detail.idea.target_buyer ?? detail.idea.councilRun.target_buyer ?? "Builders",
    status: detail.idea.factory_status,
  });

  if (!hasSupabaseEnv() || id.startsWith("idea-")) {
    return NextResponse.json({ plan: { id: `package-${id}`, product_idea_id: id, ...draft } });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data, error } = await supabase
    .from("package_plans")
    .upsert({ product_idea_id: id, ...draft }, { onConflict: "product_idea_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data });
}
