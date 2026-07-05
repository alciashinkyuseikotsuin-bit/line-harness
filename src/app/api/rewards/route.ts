import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ポイント特典 一覧取得（受領人数つき）
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: rewards, error } = await supabase
    .from("point_rewards")
    .select("*")
    .order("threshold", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: claims } = await supabase
    .from("point_reward_claims")
    .select("reward_id");

  const claimCounts = new Map<string, number>();
  (claims || []).forEach((c: { reward_id: string | null }) => {
    if (!c.reward_id) return;
    claimCounts.set(c.reward_id, (claimCounts.get(c.reward_id) || 0) + 1);
  });

  const withCounts = (rewards || []).map((r) => ({
    ...r,
    claim_count: claimCounts.get(r.id) || 0,
  }));

  return NextResponse.json({ rewards: withCounts });
}

// ポイント特典 新規作成
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { threshold, title, message, add_tag, active } = body;

  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!Number.isFinite(threshold) || threshold <= 0) {
    return NextResponse.json({ error: "到達ポイント数を正しく入力してください" }, { status: 400 });
  }
  if (!trimmedTitle) {
    return NextResponse.json({ error: "特典名を入力してください" }, { status: 400 });
  }
  if (!trimmedMessage) {
    return NextResponse.json({ error: "送信メッセージを入力してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("point_rewards")
    .insert({
      threshold,
      title: trimmedTitle,
      message: trimmedMessage,
      add_tag: typeof add_tag === "string" && add_tag.trim() ? add_tag.trim() : null,
      active: active === undefined ? true : !!active,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reward: data });
}
