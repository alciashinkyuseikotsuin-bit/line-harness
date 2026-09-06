import type { SupabaseClient } from "@supabase/supabase-js";
import { pushMessages } from "@/lib/line";
import { logEvent, logMessage } from "@/lib/logging";
import { enrollMatchingStepFlows } from "@/lib/step-enrollment";
import { getAccountById, getDefaultAccount, resolveToken } from "@/lib/accounts";

export type PointRules = {
  survey_answer: number;
  survey_complete: number;
  link_click: number;
  omikuji: number;
  daily_message: number;
  keyword_default: number;
};

// ポイントは「配信への反応」でのみ貯まる方針（2026-07-13 オーナー決定）
// おみくじ・デイリーメッセージでの付与は廃止（0）。機能自体は残すが加算しない。
const DEFAULT_RULES: PointRules = {
  survey_answer: 5,
  survey_complete: 10,
  link_click: 5, // 2026-07-14改定: 3→5（月8配信で40pt/月ペース、特典到達を現実的に）
  omikuji: 0,
  daily_message: 0,
  keyword_default: 0,
};

/** app_settings からポイント付与ルールを取得（無ければデフォルト） */
export async function getPointRules(
  supabase: SupabaseClient,
  accountId?: string
): Promise<PointRules> {
  try {
    let query = supabase
      .from("app_settings")
      .select("value")
      .eq("key", "point_rules");
    if (accountId) query = query.eq("account_id", accountId);
    const { data } = await query.limit(1).maybeSingle();
    if (data?.value) return { ...DEFAULT_RULES, ...data.value };
  } catch {
    // 設定テーブル未作成でも動くように
  }
  return DEFAULT_RULES;
}

/**
 * ポイント付与＋特典（point_rewards）の到達チェック
 * - friends.points を加算
 * - point_transactions に履歴
 * - 到達した未受領特典があれば LINE でお祝いメッセージ送信＋タグ付与
 *
 * 戻り値: 加算後の合計ポイント（付与しなかった場合は null）
 */
export async function awardPoints(
  supabase: SupabaseClient,
  friend: { id: string; line_user_id: string },
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>
): Promise<number | null> {
  if (!amount || amount <= 0) return null;

  try {
    // 現在ポイント取得 → 加算（所属アカウントも同時に取得）
    // 同じ友だちに対して複数のポイント付与が同時に走ると（例: アンケート最終問の
    // 「回答」と「完了」ボーナスが同時に加算される場合）、読み取り→計算→書き込みの
    // 間に他方の更新が割り込み、片方の加算が消えてしまう（lost update）。
    // 楽観的ロック（更新時に読み取り時点のpointsと一致するかを条件に含め、
    // 一致しなければ再読込して再試行）でこれを防ぐ。
    let current: { points: number | null; tags: string[] | null; account_id: string | null } | null = null;
    let newTotal = 0;
    let updateSucceeded = false;

    for (let attempt = 0; attempt < 5 && !updateSucceeded; attempt++) {
      const { data } = await supabase
        .from("friends")
        .select("points, tags, account_id")
        .eq("id", friend.id)
        .single();
      current = data;
      const before = current?.points || 0;
      newTotal = before + amount;

      const { data: updated } = await supabase
        .from("friends")
        .update({ points: newTotal })
        .eq("id", friend.id)
        .eq("points", before)
        .select("id");

      updateSucceeded = !!updated && updated.length > 0;
    }

    // 所属アカウントのトークンで送信・特典もアカウント内のものだけを対象にする
    const account = current?.account_id
      ? await getAccountById(supabase, current.account_id)
      : await getDefaultAccount(supabase);
    const token = resolveToken(account);

    await supabase.from("point_transactions").insert({
      friend_id: friend.id,
      amount,
      reason,
      metadata: metadata || {},
    });

    await logEvent(supabase, friend.id, "points", {
      amount,
      reason,
      total: newTotal,
    });

    // === 特典到達チェック（同じアカウントの特典のみ） ===
    let rewardsQuery = supabase
      .from("point_rewards")
      .select("id, threshold, title, message, add_tag")
      .eq("active", true)
      .lte("threshold", newTotal)
      .order("threshold", { ascending: true });
    if (current?.account_id) {
      rewardsQuery = rewardsQuery.eq("account_id", current.account_id);
    }
    const { data: rewards } = await rewardsQuery;

    if (rewards && rewards.length > 0) {
      const { data: claims } = await supabase
        .from("point_reward_claims")
        .select("reward_id")
        .eq("friend_id", friend.id);
      const claimedIds = new Set((claims || []).map((c) => c.reward_id));
      const unclaimed = rewards.filter((r) => !claimedIds.has(r.id));

      if (unclaimed.length > 0) {
        let tags: string[] = current?.tags || [];
        let tagsChanged = false;

        for (const reward of unclaimed) {
          // 二重付与防止（unique 制約もあるが先に claim を確定させる）
          const { error: claimErr } = await supabase
            .from("point_reward_claims")
            .insert({ reward_id: reward.id, friend_id: friend.id });
          if (claimErr) continue; // 既に受領済み等

          if (reward.add_tag && !tags.includes(reward.add_tag)) {
            tags = [...tags, reward.add_tag];
            tagsChanged = true;
          }

          try {
            const sent = await pushMessages(
              friend.line_user_id,
              [{ type: "text", text: reward.message }],
              "points",
              token
            );
            if (sent !== null) await logMessage(supabase, friend.id, {
              direction: "out",
              content: reward.message,
              source: "reward",
              metadata: { reward_id: reward.id, title: reward.title },
            });
          } catch (pushErr) {
            console.error("特典メッセージ送信失敗:", pushErr);
          }

          await logEvent(supabase, friend.id, "reward", {
            reward_id: reward.id,
            title: reward.title,
            threshold: reward.threshold,
          });
        }

        if (tagsChanged) {
          await supabase
            .from("friends")
            .update({ tags })
            .eq("id", friend.id);
          // 特典タグでステップ配信が発火する可能性
          await enrollMatchingStepFlows(supabase, friend.id, tags, current?.account_id || undefined, "points");
        }
      }
    }

    return newTotal;
  } catch (err) {
    console.error("awardPoints 失敗:", err);
    return null;
  }
}
