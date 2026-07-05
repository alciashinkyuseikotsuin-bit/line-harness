import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * メッセージログ（送受信すべて記録する）
 * 失敗しても本処理を止めないよう、エラーは握りつぶして console.error のみ
 */
export async function logMessage(
  supabase: SupabaseClient,
  friendId: string,
  opts: {
    direction: "in" | "out";
    messageType?: string;
    content?: string | null;
    source?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from("messages").insert({
      friend_id: friendId,
      direction: opts.direction,
      message_type: opts.messageType || "text",
      content: opts.content ?? null,
      source: opts.source || "webhook",
      metadata: opts.metadata || {},
    });
  } catch (err) {
    console.error("logMessage 失敗:", err);
  }
}

/**
 * 行動イベントログ（分析の土台。何が起きたかを1行ずつ残す）
 */
export async function logEvent(
  supabase: SupabaseClient,
  friendId: string,
  eventType: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from("friend_events").insert({
      friend_id: friendId,
      event_type: eventType,
      metadata: metadata || {},
    });
  } catch (err) {
    console.error("logEvent 失敗:", err);
  }
}

/**
 * 複数友だちへの送信ログを一括記録（一斉配信・セグメント配信用）
 */
export async function logMessagesBulk(
  supabase: SupabaseClient,
  friendIds: string[],
  opts: {
    messageType?: string;
    content?: string | null;
    source?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  if (friendIds.length === 0) return;
  try {
    const rows = friendIds.map((fid) => ({
      friend_id: fid,
      direction: "out",
      message_type: opts.messageType || "text",
      content: opts.content ?? null,
      source: opts.source || "broadcast",
      metadata: opts.metadata || {},
    }));
    // Supabase は一度に大量 insert 可能だが、念のため1000件ずつ
    for (let i = 0; i < rows.length; i += 1000) {
      await supabase.from("messages").insert(rows.slice(i, i + 1000));
    }
  } catch (err) {
    console.error("logMessagesBulk 失敗:", err);
  }
}
