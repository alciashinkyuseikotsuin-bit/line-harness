// GET /api/redemptions — 特典交換の台帳（管理画面用・proxy認証必須）
// 「誰が・いつ・何を・何ptで」交換したかの全記録。
// この記録（point_transactions の reason=特典交換 行）が存在する限り、
// 本人はサイト側でその特典を永続的に閲覧できる（会員状態・残高の影響を受けない）。

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("point_transactions")
    .select("id, friend_id, amount, metadata, created_at, friends(display_name)")
    .eq("reason", "特典交換")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const redemptions = (data || []).map((row) => {
    const meta = (row.metadata || {}) as { item_id?: string; title?: string };
    // 結合結果はSupabaseの型上、単一/配列どちらにもなり得るため両対応
    const rawFriend = row.friends as unknown;
    const friend = (Array.isArray(rawFriend) ? rawFriend[0] : rawFriend) as {
      display_name: string | null;
    } | null;
    return {
      id: row.id,
      friendId: row.friend_id,
      friendName: friend?.display_name ?? "（不明）",
      itemId: meta.item_id ?? "",
      title: meta.title ?? meta.item_id ?? "",
      points: Math.abs(row.amount ?? 0),
      redeemedAt: row.created_at,
    };
  });

  return NextResponse.json({ redemptions });
}
