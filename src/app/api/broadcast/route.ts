import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { broadcastMessage, multicastMessage } from "@/lib/line";

// 配信一覧取得
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("broadcasts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ broadcasts: data });
}

// 配信実行
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, message, targetType, targetTags, targetChoiceId } = body;

  const supabase = getSupabaseAdmin();

  try {
    let deliveredCount = 0;

    if (targetType === "all") {
      // 全友だちに一斉配信
      await broadcastMessage(message);
      const { count } = await supabase
        .from("friends")
        .select("*", { count: "exact", head: true })
        .eq("is_blocked", false);
      deliveredCount = count || 0;
    } else if (targetType === "segment" && targetTags?.length > 0) {
      // タグベースのセグメント配信
      const { data: friends } = await supabase
        .from("friends")
        .select("line_user_id")
        .eq("is_blocked", false)
        .overlaps("tags", targetTags);

      if (friends && friends.length > 0) {
        const userIds = friends.map((f) => f.line_user_id);
        // LINE マルチキャストは500人まで
        for (let i = 0; i < userIds.length; i += 500) {
          await multicastMessage(userIds.slice(i, i + 500), message);
        }
        deliveredCount = friends.length;
      }
    } else if (targetType === "survey" && targetChoiceId) {
      // アンケート回答ベースの配信
      const { data: responses } = await supabase
        .from("survey_responses")
        .select("friend_id, friends(line_user_id)")
        .eq("choice_id", targetChoiceId);

      if (responses && responses.length > 0) {
        const userIds = responses
          .map((r: any) => r.friends?.line_user_id)
          .filter(Boolean) as string[];

        for (let i = 0; i < userIds.length; i += 500) {
          await multicastMessage(userIds.slice(i, i + 500), message);
        }
        deliveredCount = userIds.length;
      }
    }

    // 配信履歴を保存
    const { data: broadcast, error } = await supabase
      .from("broadcasts")
      .insert({
        title,
        message_text: message,
        target_type: targetType,
        target_tags: targetTags || [],
        target_choice_id: targetChoiceId || null,
        status: "sent",
        sent_at: new Date().toISOString(),
        delivered_count: deliveredCount,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ broadcast, deliveredCount });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "配信に失敗しました" },
      { status: 500 }
    );
  }
}
