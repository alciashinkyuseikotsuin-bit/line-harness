import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recalcAllScores } from "@/lib/engagement";
import { getAccountFromRequest } from "@/lib/accounts";

export const maxDuration = 300;

// 全友だちのエンゲージメントスコアを再計算（ダッシュボードのボタンから実行）
// アカウント指定時はそのアカウントの友だちのみ再計算
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;

  if (accountId) {
    const { data: friends } = await supabase
      .from("friends")
      .select("id")
      .eq("account_id", accountId);
    const friendIds = (friends || []).map((f) => f.id);
    const result = await recalcAllScores(supabase, friendIds);
    return NextResponse.json(result);
  }

  const result = await recalcAllScores(supabase);
  return NextResponse.json(result);
}
