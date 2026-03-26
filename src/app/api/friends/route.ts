import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// 友だち一覧取得
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const tag = searchParams.get("tag") || "";

  let query = supabase
    .from("friends")
    .select("*")
    .eq("is_blocked", false)
    .order("last_active_at", { ascending: false });

  if (search) {
    query = query.ilike("display_name", `%${search}%`);
  }

  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ friends: data });
}
