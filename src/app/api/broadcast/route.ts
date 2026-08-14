import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  broadcastMessage,
  broadcastMessages,
  multicastMessage,
  multicastMessages,
} from "@/lib/line";
import {
  blocksToLineMessagesAsync,
  findStepOnlySurveyTitles,
} from "@/lib/blocks-to-line";
import type { MessageBlock } from "@/types/blocks";
import { logMessagesBulk } from "@/lib/logging";
import {
  blocksNeedPersonalization,
  sendPersonalizedBlocks,
  type FriendForPersonalize,
} from "@/lib/personalize";
import { getAccountFromRequest, resolveToken } from "@/lib/accounts";

// 配信対象の友だち情報（個別化・ログ用。account_id はアカウント跨ぎ配信ブロックに使用）
const FRIEND_SELECT = "id, line_user_id, display_name, points, stage, account_id";

// 送信後のログ記録（一括）
async function logBroadcastSent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  friends: FriendForPersonalize[],
  blocks: MessageBlock[] | null,
  fallbackMessage: string | undefined
) {
  const content = blocks
    ? blocks
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text)
        .join("\n") || `[${blocks.map((b) => b.type).join(",")}]`
    : fallbackMessage || "";
  await logMessagesBulk(
    supabase,
    friends.map((f) => f.id),
    { content, source: "broadcast" }
  );
}

// 配信一覧取得
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;

  let query = supabase
    .from("broadcasts")
    .select("*")
    .order("created_at", { ascending: false });

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ broadcasts: data });
}

// 配信実行 or 下書き保存（saveAsDraft=true で送信せず保存のみ）
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, message, blocks, targetType, targetTags, targetChoiceId, saveAsDraft, scheduledAt } = body;

  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;
  const token = resolveToken(account);

  // ステップ配信専用アンケートのガード:
  // 一斉・セグメント・予約・下書きのどの経路でも、step_only アンケートを含む配信は受け付けない。
  // （このアンケートは新規登録者の2日目ステップでのみ送る運用のため、全員配信を仕組みで禁止）
  if (Array.isArray(blocks)) {
    const stepOnlyTitles = await findStepOnlySurveyTitles(
      blocks as MessageBlock[],
      supabase
    );
    if (stepOnlyTitles.length > 0) {
      return NextResponse.json(
        {
          error: `「${stepOnlyTitles.join("」「")}」はステップ配信専用のアンケートです。一斉・セグメント・予約配信では送信できません（新規登録者向けステップ配信の中でのみ送れます）`,
        },
        { status: 400 }
      );
    }
  }

  // 予約配信モード: scheduledAt が未来時刻なら status='scheduled' で保存
  if (scheduledAt) {
    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "予約日時の形式が不正です" }, { status: 400 });
    }
    if (scheduledDate.getTime() <= Date.now()) {
      return NextResponse.json({ error: "予約日時は現在より未来を指定してください" }, { status: 400 });
    }

    const messageText = Array.isArray(blocks)
      ? blocks
          .filter((b: { type: string; text?: string }) => b.type === "text" && b.text)
          .map((b: { text: string }) => b.text)
          .join("\n")
      : (message || "");

    const { data: broadcast, error } = await supabase
      .from("broadcasts")
      .insert({
        title: title || "予約配信",
        message_text: messageText,
        message_blocks: blocks || null,
        target_type: targetType || "all",
        target_tags: Array.isArray(targetTags) ? targetTags : [],
        target_choice_id: targetChoiceId || null,
        status: "scheduled",
        scheduled_at: scheduledDate.toISOString(),
        account_id: accountId ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ broadcast, scheduled: true, scheduledAt: scheduledDate.toISOString() });
  }

  // 下書き保存モード: 送信せずに status='draft' で保存
  if (saveAsDraft) {
    const messageText = Array.isArray(blocks)
      ? blocks
          .filter((b: { type: string; text?: string }) => b.type === "text" && b.text)
          .map((b: { text: string }) => b.text)
          .join("\n")
      : (message || "");

    const { data: broadcast, error } = await supabase
      .from("broadcasts")
      .insert({
        title: title || "下書き",
        message_text: messageText,
        message_blocks: blocks || null,
        target_type: targetType || "all",
        target_tags: Array.isArray(targetTags) ? targetTags : [],
        target_choice_id: targetChoiceId || null,
        status: "draft",
        account_id: accountId ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ broadcast, savedAsDraft: true });
  }

  try {
    let deliveredCount = 0;

    // ブロック配列からLINEメッセージを生成（survey ブロックは DB から展開するので非同期）
    // blocksがない場合はmessageから単一テキストメッセージ（後方互換）
    const lineMessages = blocks
      ? await blocksToLineMessagesAsync(blocks as MessageBlock[], supabase)
      : null;

    // {name} や {link:} を含む場合は1人ずつ個別化して送る
    const personalize =
      !!blocks && blocksNeedPersonalization(blocks as MessageBlock[]);

    if (targetType === "all") {
      // 全友だちに一斉配信（アカウント指定時はそのアカウントの友だちのみ）
      let allFriendsQuery = supabase
        .from("friends")
        .select(FRIEND_SELECT)
        .eq("is_blocked", false);
      if (accountId) {
        allFriendsQuery = allFriendsQuery.eq("account_id", accountId);
      }
      const { data: allFriends } = await allFriendsQuery;
      const targets = (allFriends || []) as FriendForPersonalize[];

      if (personalize) {
        deliveredCount = await sendPersonalizedBlocks(
          supabase,
          targets,
          blocks as MessageBlock[],
          "broadcast",
          undefined,
          token
        );
      } else {
        if (lineMessages && lineMessages.length > 0) {
          await broadcastMessages(lineMessages as any[], token);
        } else if (message) {
          await broadcastMessage(message, token);
        }
        deliveredCount = targets.length;
        await logBroadcastSent(supabase, targets, blocks || null, message);
      }
    } else if (targetType === "segment" && targetTags?.length > 0) {
      // タグベースのセグメント配信
      let friendsQuery = supabase
        .from("friends")
        .select(FRIEND_SELECT)
        .eq("is_blocked", false)
        .overlaps("tags", targetTags);
      if (accountId) {
        friendsQuery = friendsQuery.eq("account_id", accountId);
      }
      const { data: friends } = await friendsQuery;
      const targets = (friends || []) as FriendForPersonalize[];

      if (targets.length > 0) {
        if (personalize) {
          deliveredCount = await sendPersonalizedBlocks(
            supabase,
            targets,
            blocks as MessageBlock[],
            "broadcast",
            undefined,
            token
          );
        } else {
          const userIds = targets.map((f) => f.line_user_id);
          // LINE マルチキャストは500人まで
          for (let i = 0; i < userIds.length; i += 500) {
            const chunk = userIds.slice(i, i + 500);
            if (lineMessages && lineMessages.length > 0) {
              await multicastMessages(chunk, lineMessages as any[], token);
            } else if (message) {
              await multicastMessage(chunk, message, token);
            }
          }
          deliveredCount = targets.length;
          await logBroadcastSent(supabase, targets, blocks || null, message);
        }
      }
    } else if (targetType === "survey" && targetChoiceId) {
      // アンケート回答ベースの配信
      const { data: responses } = await supabase
        .from("survey_responses")
        .select(`friend_id, friends(${FRIEND_SELECT})`)
        .eq("choice_id", targetChoiceId);

      if (responses && responses.length > 0) {
        let targets = responses
          .map((r: any) => r.friends)
          .filter(Boolean) as FriendForPersonalize[];
        if (accountId) {
          targets = targets.filter(
            (f: any) => !f.account_id || f.account_id === accountId
          );
        }

        if (personalize) {
          deliveredCount = await sendPersonalizedBlocks(
            supabase,
            targets,
            blocks as MessageBlock[],
            "broadcast",
            undefined,
            token
          );
        } else {
          const userIds = targets.map((f) => f.line_user_id);
          for (let i = 0; i < userIds.length; i += 500) {
            const chunk = userIds.slice(i, i + 500);
            if (lineMessages && lineMessages.length > 0) {
              await multicastMessages(chunk, lineMessages as any[], token);
            } else if (message) {
              await multicastMessage(chunk, message, token);
            }
          }
          deliveredCount = targets.length;
          await logBroadcastSent(supabase, targets, blocks || null, message);
        }
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
        account_id: accountId ?? null,
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
