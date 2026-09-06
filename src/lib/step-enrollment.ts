import type { SupabaseClient } from "@supabase/supabase-js";
import { pushMessage, pushMessages, type SendFeature } from "@/lib/line";
import { logMessage } from "@/lib/logging";
import { renderTemplate, type FriendForPersonalize } from "@/lib/personalize";
import { getAccountById, resolveToken, type LineAccount } from "@/lib/accounts";
import { blocksToLineMessagesAsync } from "@/lib/blocks-to-line";
import type { MessageBlock } from "@/types/blocks";

type StepFlowRow = {
  id: string;
  trigger_tag: string | null;
  trigger_tags: string[] | null;
  trigger_match_mode: "any" | "all" | null;
};

/**
 * 友だちの現在のタグセットに対して、トリガー条件を満たす全ステップフローへ enroll する。
 *
 * トリガー判定:
 *   - effectiveTriggers = trigger_tags があればそれ、無ければ trigger_tag を1要素配列に（後方互換）
 *   - mode='any': friendTags がいずれか1つでも含めばマッチ
 *   - mode='all': friendTags が全て含めばマッチ
 *   - effectiveTriggers が空のフローはマッチしない
 *
 * 既に enroll 済みの場合は upsert の onConflict("flow_id,friend_id") で無視される。
 *
 * 1通目（delay_minutes=0など、今すぐ送るべきもの）は、外部cronの巡回を待たず
 * この場で同期的に送信する。日をまたぐ2通目以降だけをcronの巡回に任せる。
 */
export async function enrollMatchingStepFlows(
  supabase: SupabaseClient,
  friendId: string,
  friendTags: string[],
  accountId: string | undefined,
  originFeature: SendFeature
): Promise<void> {
  // アカウント未指定なら友だちから引く（同じアカウントのフローだけに登録する）
  let effectiveAccountId = accountId;
  if (!effectiveAccountId) {
    try {
      const { data: f } = await supabase
        .from("friends")
        .select("account_id")
        .eq("id", friendId)
        .single();
      effectiveAccountId = f?.account_id || undefined;
    } catch {
      // migration 007 未実行なら全フロー対象（従来動作）
    }
  }

  let flowQuery = supabase
    .from("step_flows")
    .select("id, trigger_tag, trigger_tags, trigger_match_mode")
    .eq("status", "active");
  if (effectiveAccountId) {
    flowQuery = flowQuery.eq("account_id", effectiveAccountId);
  }
  const { data: flows } = await flowQuery;

  if (!flows || flows.length === 0) return;

  const tagSet = new Set(friendTags);
  const immediateEnrollmentIds: string[] = [];

  for (const flow of flows as StepFlowRow[]) {
    const triggers =
      flow.trigger_tags && flow.trigger_tags.length > 0
        ? flow.trigger_tags
        : flow.trigger_tag
          ? [flow.trigger_tag]
          : [];

    if (triggers.length === 0) continue;

    const mode = flow.trigger_match_mode || "any";
    const matched =
      mode === "all"
        ? triggers.every((t) => tagSet.has(t))
        : triggers.some((t) => tagSet.has(t));

    if (!matched) continue;

    // 【重要】一度でも登録されたことのあるフローには絶対に再登録しない。
    // 以前は upsert(ignoreDuplicates:false) で既存行を active/step0 に上書きしており、
    // タグが変わるたびに配信済みフローが最初から再送される事故が起きた
    // （例: 「入会希望」タグ付与→過去の単価UPプレゼントが再送）。
    const { data: existing } = await supabase
      .from("step_enrollments")
      .select("id")
      .eq("flow_id", flow.id)
      .eq("friend_id", friendId)
      .limit(1);
    if (existing && existing.length > 0) continue;

    // first step's delay を取得
    const { data: firstStep } = await supabase
      .from("step_messages")
      .select("delay_minutes")
      .eq("flow_id", flow.id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .single();

    const nextSendAt = new Date();
    const delayMinutes = firstStep?.delay_minutes || 0;
    nextSendAt.setMinutes(nextSendAt.getMinutes() + delayMinutes);

    const { data: enrollment } = await supabase
      .from("step_enrollments")
      .insert({
        flow_id: flow.id,
        friend_id: friendId,
        current_step: 0,
        status: "active",
        enrolled_at: new Date().toISOString(),
        next_send_at: nextSendAt.toISOString(),
      })
      .select("id, status")
      .single();

    if (enrollment && delayMinutes <= 0 && enrollment.status === "active") {
      immediateEnrollmentIds.push(enrollment.id);
    }
  }

  // 「今すぐ送るべき」1通目は、cronの巡回を待たずこの場で送信する
  for (const enrollmentId of immediateEnrollmentIds) {
    try {
      await processDueEnrollmentById(supabase, enrollmentId, undefined, originFeature);
    } catch (err) {
      console.error("即時ステップ配信エラー:", err);
      // ここで失敗しても enrollment 自体は active のまま残るので、
      // 次回のcron巡回で拾われて再送される（next_send_at が過去のまま）。
    }
  }
}

/**
 * 1件の step_enrollment を処理する（対象メッセージを送信し、次ステップへ進める/完了させる）。
 * cronによる巡回処理（/api/step-flows/process）と、enrollMatchingStepFlows からの
 * 即時送信の両方から呼ばれる共通ロジック。
 */
export async function processDueEnrollmentById(
  supabase: SupabaseClient,
  enrollmentId: string,
  accountCache: Map<string, LineAccount | null> | undefined,
  feature: SendFeature
): Promise<{ sent: boolean; completed: boolean }> {
  const cache = accountCache || new Map<string, LineAccount | null>();

  const { data: enrollment } = await supabase
    .from("step_enrollments")
    .select(
      "*, step_flows(id, status, account_id), friends(id, line_user_id, display_name, points, stage, is_blocked)"
    )
    .eq("id", enrollmentId)
    .eq("status", "active")
    .single();

  if (!enrollment) return { sent: false, completed: false };
  if (enrollment.step_flows?.status !== "active") return { sent: false, completed: false };

  // ブロック済みの友だちには送れない。enrollment を cancel して巡回のたびの
  // 送信エラー（永久リトライ）を防ぐ
  if ((enrollment.friends as { is_blocked?: boolean } | null)?.is_blocked) {
    await supabase
      .from("step_enrollments")
      .update({ status: "cancelled" })
      .eq("id", enrollment.id);
    return { sent: false, completed: false };
  }

  const { data: messages } = await supabase
    .from("step_messages")
    .select("*")
    .eq("flow_id", enrollment.flow_id)
    .order("sort_order", { ascending: true });

  if (!messages || enrollment.current_step >= messages.length) {
    await supabase
      .from("step_enrollments")
      .update({ status: "completed" })
      .eq("id", enrollment.id);
    return { sent: false, completed: true };
  }

  const currentMessage = messages[enrollment.current_step];
  const friend = enrollment.friends as FriendForPersonalize | null;
  const lineUserId = friend?.line_user_id;

  if (!lineUserId || !currentMessage) return { sent: false, completed: false };

  const accountId = (enrollment.step_flows as { account_id?: string | null } | null)
    ?.account_id;
  if (accountId && !cache.has(accountId)) {
    cache.set(accountId, await getAccountById(supabase, accountId));
  }
  const token = resolveToken(accountId ? cache.get(accountId) || null : null);

  // message_blocks があればブロックとして送信（テキスト・画像・動画・アンケートFlex）。
  // アンケートブロックはこの友だち1人だけに送られるため、
  // 「新規登録者の2日目にだけアンケートを流す」の実現経路になる。
  // blocks が無い旧データは従来どおり message_text をテキスト送信。
  const blocks = currentMessage.message_blocks as MessageBlock[] | null;
  let logContent: string;
  let wasSent = false;

  if (Array.isArray(blocks) && blocks.length > 0) {
    const personalized: MessageBlock[] = friend
      ? blocks.map((b) =>
          b.type === "text" && b.text
            ? { ...b, text: renderTemplate(b.text, friend) }
            : b
        )
      : blocks;
    const lineMessages = await blocksToLineMessagesAsync(personalized, supabase);
    if (lineMessages.length === 0) return { sent: false, completed: false };
    const result = await pushMessages(lineUserId, lineMessages, feature, token);
    wasSent = result !== null;
    logContent =
      personalized
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text)
        .join("\n") || `[${personalized.map((b) => b.type).join(",")}]`;
  } else {
    const text = friend
      ? renderTemplate(currentMessage.message_text, friend)
      : currentMessage.message_text;
    const result = await pushMessage(lineUserId, text, feature, token);
    wasSent = result !== null;
    logContent = text;
  }

  if (wasSent) await logMessage(supabase, enrollment.friend_id, {
    direction: "out",
    content: logContent,
    source: "step",
    metadata: { flow_id: enrollment.flow_id, step: enrollment.current_step },
  });

  // A gate skip consumes this step as well: do not queue it for a later cron retry.
  const nextStep = enrollment.current_step + 1;

  if (nextStep >= messages.length) {
    await supabase
      .from("step_enrollments")
      .update({ current_step: nextStep, status: "completed" })
      .eq("id", enrollment.id);
    return { sent: wasSent, completed: true };
  }

  const nextMessage = messages[nextStep];
  const nextSendAt = new Date();
  nextSendAt.setMinutes(nextSendAt.getMinutes() + nextMessage.delay_minutes);

  await supabase
    .from("step_enrollments")
    .update({
      current_step: nextStep,
      next_send_at: nextSendAt.toISOString(),
    })
    .eq("id", enrollment.id);

  return { sent: wasSent, completed: false };
}
