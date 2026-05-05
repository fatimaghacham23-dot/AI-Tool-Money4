import { NextResponse } from "next/server";

import { getMockPackagePlan } from "@/lib/data/mock";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!hasSupabaseEnv() || id.startsWith("idea-")) {
    return NextResponse.json({ plan: getMockPackagePlan(id) });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data, error } = await supabase
    .from("package_plans")
    .select("*")
    .eq("product_idea_id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data });
}
