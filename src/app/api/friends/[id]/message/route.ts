import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { pushMessage } from "@/lib/line";
import { logMessage, logEvent } from "@/lib/logging";
import { getAccountForFriend, resolveToken } from "@/lib/accounts";

// 顧客カルテからの1:1手動送信（管理者がボタンを押した時のみ実行。自動送信ではない）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const text = (body?.text || "").trim();

  if (!text) {
    return NextResponse.json(
      { error: "本文を入力してください" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: friend, error: friendError } = await supabase
    .from("friends")
    .select("line_user_id")
    .eq("id", id)
    .single();

  if (friendError || !friend) {
    return NextResponse.json(
      { error: "友だちが見つかりません" },
      { status: 404 }
    );
  }

  try {
    const account = await getAccountForFriend(supabase, id);
    const token = resolveToken(account);
    const sent = await pushMessage(friend.line_user_id, text, "manual_chat", token);
    if (sent === null) return NextResponse.json({ sent: false, skipped: true, error: "送信制御によりスキップしました" }, { status: 409 });
  } catch (err) {
    console.error("1:1送信失敗:", err);
    return NextResponse.json(
      { error: "LINEへの送信に失敗しました" },
      { status: 500 }
    );
  }

  await logMessage(supabase, id, {
    direction: "out",
    content: text,
    source: "manual",
  });
  await logEvent(supabase, id, "manual_message", { text });

  return NextResponse.json({ success: true });
}
