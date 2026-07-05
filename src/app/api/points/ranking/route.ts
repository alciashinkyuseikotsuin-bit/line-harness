import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAccountFromRequest } from "@/lib/accounts";

// ポイントランキング トップ30
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;

  let query = supabase
    .from("friends")
    .select("id, display_name, picture_url, points, stage")
    .order("points", { ascending: false })
    .limit(30);
  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ranking: data || [] });
}
