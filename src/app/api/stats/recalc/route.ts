import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recalcAllScores } from "@/lib/engagement";

export const maxDuration = 300;

// 全友だちのエンゲージメントスコアを再計算（ダッシュボードのボタンから実行）
export async function POST() {
  const supabase = getSupabaseAdmin();
  const result = await recalcAllScores(supabase);
  return NextResponse.json(result);
}
