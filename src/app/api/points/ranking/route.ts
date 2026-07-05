import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ポイントランキング トップ30
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("friends")
    .select("id, display_name, picture_url, points, stage")
    .order("points", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ranking: data || [] });
}
