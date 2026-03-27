import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  broadcastMessage,
  broadcastMessages,
  multicastMessage,
  multicastMessages,
  blocksToLineMessages,
} from "@/lib/line";
import type { MessageBlock } from "@/types/blocks";

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
  const { title, message, blocks, targetType, targetTags, targetChoiceId } = body;

  const supabase = getSupabaseAdmin();

  try {
    let deliveredCount = 0;

    // ブロック配列からLINEメッセージを生成（新API）
    // blocksがない場合はmessageから単一テキストメッセージ（後方互換）
    const lineMessages = blocks
      ? blocksToLineMessages(blocks as MessageBlock[])
      : null;

    if (targetType === "all") {
      // 全友だちに一斉配信
      if (lineMessages && lineMessages.length > 0) {
        await broadcastMessages(lineMessages);
      } else if (message) {
        await broadcastMessage(message);
      }
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
          const chunk = userIds.slice(i, i + 500);
          if (lineMessages && lineMessages.length > 0) {
            await multicastMessages(chunk, lineMessages);
          } else if (message) {
            await multicastMessage(chunk, message);
          }
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
          const chunk = userIds.slice(i, i + 500);
          if (lineMessages && lineMessages.length > 0) {
            await multicastMessages(chunk, lineMessages);
          } else if (message) {
            await multicastMessage(chunk, message);
          }
        }
        deliveredCount = userIds.length;
      }
    }

    // 配信履歴を保存
    const messageText = blocks
      ? (blocks as MessageBlock[])
          .filter((b: MessageBlock) => b.type === "text" && b.text)
          .map((b: MessageBlock) => b.text)
          .join("\n")
      : message;

    const { data: broadcast, error } = await supabase
      .from("broadcasts")
      .insert({
        title,
        message_text: messageText || "",
        message_blocks: blocks || null,
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
