import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  broadcastMessages,
  multicastMessages,
} from "@/lib/line";
import { blocksToLineMessagesAsync } from "@/lib/blocks-to-line";
import type { MessageBlock } from "@/types/blocks";
import { logMessagesBulk } from "@/lib/logging";
import {
  blocksNeedPersonalization,
  sendPersonalizedBlocks,
  type FriendForPersonalize,
} from "@/lib/personalize";

const FRIEND_SELECT = "id, line_user_id, display_name, points, stage";

// 非個別化送信後のログ記録
async function logSent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  friends: FriendForPersonalize[],
  blocks: MessageBlock[]
) {
  const content =
    blocks
      .filter((bl) => bl.type === "text" && bl.text)
      .map((bl) => bl.text)
      .join("\n") || `[${blocks.map((bl) => bl.type).join(",")}]`;
  await logMessagesBulk(
    supabase,
    friends.map((f) => f.id),
    { content, source: "broadcast" }
  );
}

// 予約配信ワーカー（Vercel Cron から呼ばれる）
// scheduled_at が現在時刻以下 + status='scheduled' の broadcasts を順次送信
export async function GET() {
  return runProcess();
}
export async function POST() {
  return runProcess();
}

async function runProcess() {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: dueBroadcasts, error } = await supabase
    .from("broadcasts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", now);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!dueBroadcasts || dueBroadcasts.length === 0) {
    return NextResponse.json({ sent: 0, processed: 0 });
  }

  let sent = 0;
  const errors: string[] = [];

  for (const b of dueBroadcasts) {
    try {
      const blocks = b.message_blocks as MessageBlock[] | null;
      if (!blocks || blocks.length === 0) {
        // メッセージなし→失敗扱い
        await supabase
          .from("broadcasts")
          .update({ status: "failed" })
          .eq("id", b.id);
        continue;
      }

      const lineMessages = await blocksToLineMessagesAsync(blocks, supabase);
      if (lineMessages.length === 0) {
        await supabase
          .from("broadcasts")
          .update({ status: "failed" })
          .eq("id", b.id);
        continue;
      }

      let deliveredCount = 0;
      const personalize = blocksNeedPersonalization(blocks);

      if (b.target_type === "all") {
        const { data: allFriends } = await supabase
          .from("friends")
          .select(FRIEND_SELECT)
          .eq("is_blocked", false);
        const targets = (allFriends || []) as FriendForPersonalize[];

        if (personalize) {
          deliveredCount = await sendPersonalizedBlocks(
            supabase,
            targets,
            blocks,
            "broadcast"
          );
        } else {
          await broadcastMessages(lineMessages as unknown[] as never[]);
          deliveredCount = targets.length;
          await logSent(supabase, targets, blocks);
        }
      } else if (
        b.target_type === "segment" &&
        Array.isArray(b.target_tags) &&
        b.target_tags.length > 0
      ) {
        const { data: friends } = await supabase
          .from("friends")
          .select(FRIEND_SELECT)
          .eq("is_blocked", false)
          .overlaps("tags", b.target_tags);
        const targets = (friends || []) as FriendForPersonalize[];

        if (personalize) {
          deliveredCount = await sendPersonalizedBlocks(
            supabase,
            targets,
            blocks,
            "broadcast"
          );
        } else {
          const userIds = targets.map((f) => f.line_user_id);
          for (let i = 0; i < userIds.length; i += 500) {
            const chunk = userIds.slice(i, i + 500);
            await multicastMessages(chunk, lineMessages as unknown[] as never[]);
          }
          deliveredCount = targets.length;
          await logSent(supabase, targets, blocks);
        }
      }

      await supabase
        .from("broadcasts")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          delivered_count: deliveredCount,
        })
        .eq("id", b.id);

      sent++;
    } catch (err) {
      console.error("予約配信エラー:", b.id, err);
      errors.push(`${b.id}: ${(err as Error).message}`);
      await supabase
        .from("broadcasts")
        .update({ status: "failed" })
        .eq("id", b.id);
    }
  }

  return NextResponse.json({
    sent,
    processed: dueBroadcasts.length,
    errors,
  });
}
