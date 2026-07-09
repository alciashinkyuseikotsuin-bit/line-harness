import type { SupabaseClient } from "@supabase/supabase-js";

export type AutoReply = {
  id: string;
  name: string;
  keywords: string[];
  match_type: "exact" | "partial";
  reply_text: string;
  add_tags: string[];
  points: number;
  once_per_friend: boolean;
  priority: number;
};

/**
 * 受信テキストにマッチする自動応答を1件返す（priority 降順で最初のマッチ）
 * once_per_friend のものは過去に反応済みならスキップ
 */
export async function findAutoReply(
  supabase: SupabaseClient,
  friendId: string,
  text: string,
  accountId?: string
): Promise<AutoReply | null> {
  let replyQuery = supabase
    .from("auto_replies")
    .select("*")
    .eq("active", true)
    .order("priority", { ascending: false });
  if (accountId) replyQuery = replyQuery.eq("account_id", accountId);
  const { data: replies } = await replyQuery;

  if (!replies || replies.length === 0) return null;

  const normalized = text.trim().toLowerCase();

  for (const reply of replies as AutoReply[]) {
    const matched = (reply.keywords || []).some((kw) => {
      const k = kw.trim().toLowerCase();
      if (!k) return false;
      return reply.match_type === "exact"
        ? normalized === k
        : normalized.includes(k);
    });
    if (!matched) continue;

    if (reply.once_per_friend) {
      const { count } = await supabase
        .from("friend_events")
        .select("*", { count: "exact", head: true })
        .eq("friend_id", friendId)
        .eq("event_type", "keyword_reply")
        .eq("metadata->>reply_id", reply.id);
      if ((count || 0) > 0) continue;
    }

    return reply;
  }
  return null;
}

/** JST の今日の日付 (YYYY-MM-DD)。おみくじの1日1回判定に使う */
export function jstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export type OmikujiResult =
  | { status: "drawn"; fortune: string; message: string; itemId: string }
  | { status: "already" }
  | { status: "empty" };

/**
 * おみくじを引く（1日1回・重み付き抽選）
 */
export async function drawOmikuji(
  supabase: SupabaseClient,
  friendId: string,
  accountId?: string
): Promise<OmikujiResult> {
  const today = jstToday();

  // 今日すでに引いたか
  const { count } = await supabase
    .from("omikuji_draws")
    .select("*", { count: "exact", head: true })
    .eq("friend_id", friendId)
    .eq("drawn_on", today);
  if ((count || 0) > 0) return { status: "already" };

  let itemQuery = supabase
    .from("omikuji_items")
    .select("id, fortune, message, weight")
    .eq("active", true);
  if (accountId) itemQuery = itemQuery.eq("account_id", accountId);
  const { data: items } = await itemQuery;
  if (!items || items.length === 0) return { status: "empty" };

  // 重み付き抽選
  const totalWeight = items.reduce((sum, i) => sum + Math.max(i.weight, 1), 0);
  let r = Math.random() * totalWeight;
  let picked = items[0];
  for (const item of items) {
    r -= Math.max(item.weight, 1);
    if (r <= 0) {
      picked = item;
      break;
    }
  }

  // 記録（unique 制約で同日二重引きも防止）
  const { error } = await supabase.from("omikuji_draws").insert({
    friend_id: friendId,
    item_id: picked.id,
    drawn_on: today,
  });
  if (error) return { status: "already" };

  return {
    status: "drawn",
    fortune: picked.fortune,
    message: picked.message,
    itemId: picked.id,
  };
}

/** 組み込みコマンド判定 */
export type BuiltinCommand = "omikuji" | "points" | "survey" | null;

export function detectBuiltinCommand(text: string): BuiltinCommand {
  const t = text.trim();
  if (/^(おみくじ|運勢|今日の運勢)$/.test(t)) return "omikuji";
  if (/^(ポイント|マイポイント|ポイント確認|pt)$/i.test(t)) return "points";
  if (/^(アンケート|診断)$/.test(t)) return "survey";
  return null;
}
