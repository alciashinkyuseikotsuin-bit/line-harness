import type { SupabaseClient } from "@supabase/supabase-js";

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
 */
export async function enrollMatchingStepFlows(
  supabase: SupabaseClient,
  friendId: string,
  friendTags: string[]
): Promise<void> {
  const { data: flows } = await supabase
    .from("step_flows")
    .select("id, trigger_tag, trigger_tags, trigger_match_mode")
    .eq("status", "active");

  if (!flows || flows.length === 0) return;

  const tagSet = new Set(friendTags);

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

    // first step's delay を取得
    const { data: firstStep } = await supabase
      .from("step_messages")
      .select("delay_minutes")
      .eq("flow_id", flow.id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .single();

    const nextSendAt = new Date();
    if (firstStep) {
      nextSendAt.setMinutes(nextSendAt.getMinutes() + firstStep.delay_minutes);
    }

    await supabase.from("step_enrollments").upsert(
      {
        flow_id: flow.id,
        friend_id: friendId,
        current_step: 0,
        status: "active",
        enrolled_at: new Date().toISOString(),
        next_send_at: nextSendAt.toISOString(),
      },
      { onConflict: "flow_id,friend_id" }
    );
  }
}
