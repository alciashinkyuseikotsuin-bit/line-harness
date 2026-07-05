import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * エンゲージメントスコア（0〜100）
 *
 * 内訳:
 * - 直近アクティブ度（最終アクティブからの日数）: 最大40点
 * - 直近30日の受信メッセージ数: 最大20点
 * - アンケート回答数（累計）: 最大15点
 * - 直近30日のリンククリック数: 最大15点
 * - 直近30日のエンゲージイベント（おみくじ・キーワード等）: 最大10点
 */
export type ScoreBand = "ホット" | "アクティブ" | "ライト" | "休眠";

export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return "ホット";
  if (score >= 40) return "アクティブ";
  if (score >= 15) return "ライト";
  return "休眠";
}

function recencyScore(lastActiveAt: string | null): number {
  if (!lastActiveAt) return 0;
  const days =
    (Date.now() - new Date(lastActiveAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 1) return 40;
  if (days <= 3) return 35;
  if (days <= 7) return 28;
  if (days <= 14) return 20;
  if (days <= 30) return 10;
  if (days <= 60) return 5;
  return 0;
}

function cappedScore(count: number, perItem: number, max: number): number {
  return Math.min(count * perItem, max);
}

/**
 * 1人分のスコアを再計算して friends.engagement_score に保存する。
 * webhook から fire-and-forget で呼んでも安全なように、内部でエラーを握る。
 */
export async function recalcFriendScore(
  supabase: SupabaseClient,
  friendId: string
): Promise<number | null> {
  try {
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const [friendRes, msgRes, surveyRes, clickRes, engageRes] =
      await Promise.all([
        supabase
          .from("friends")
          .select("last_active_at")
          .eq("id", friendId)
          .single(),
        supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("friend_id", friendId)
          .eq("direction", "in")
          .gte("created_at", thirtyDaysAgo),
        supabase
          .from("survey_responses")
          .select("*", { count: "exact", head: true })
          .eq("friend_id", friendId),
        supabase
          .from("friend_events")
          .select("*", { count: "exact", head: true })
          .eq("friend_id", friendId)
          .eq("event_type", "link_click")
          .gte("created_at", thirtyDaysAgo),
        supabase
          .from("friend_events")
          .select("*", { count: "exact", head: true })
          .eq("friend_id", friendId)
          .in("event_type", ["omikuji", "keyword_reply", "diagnosis_complete"])
          .gte("created_at", thirtyDaysAgo),
      ]);

    const score =
      recencyScore(friendRes.data?.last_active_at || null) +
      cappedScore(msgRes.count || 0, 2, 20) +
      cappedScore(surveyRes.count || 0, 3, 15) +
      cappedScore(clickRes.count || 0, 5, 15) +
      cappedScore(engageRes.count || 0, 2, 10);

    await supabase
      .from("friends")
      .update({
        engagement_score: score,
        score_updated_at: new Date().toISOString(),
      })
      .eq("id", friendId);

    return score;
  } catch (err) {
    console.error("recalcFriendScore 失敗:", err);
    return null;
  }
}

/**
 * 全友だち（またはID指定）のスコアを再計算。ダッシュボード・バッチ用。
 */
export async function recalcAllScores(
  supabase: SupabaseClient,
  friendIds?: string[]
): Promise<{ updated: number }> {
  let ids = friendIds;
  if (!ids) {
    const { data } = await supabase.from("friends").select("id");
    ids = (data || []).map((f) => f.id);
  }
  let updated = 0;
  // 逐次だと遅いので5並列
  for (let i = 0; i < ids.length; i += 5) {
    const chunk = ids.slice(i, i + 5);
    const results = await Promise.all(
      chunk.map((id) => recalcFriendScore(supabase, id))
    );
    updated += results.filter((r) => r !== null).length;
  }
  return { updated };
}
