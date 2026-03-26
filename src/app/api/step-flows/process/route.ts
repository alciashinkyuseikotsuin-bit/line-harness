import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { pushMessage } from "@/lib/line";

// ステップ配信の実行（定期実行用）
export async function POST() {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // 送信すべきエンロールメントを取得
  const { data: enrollments, error } = await supabase
    .from("step_enrollments")
    .select("*, step_flows(id, status), friends(line_user_id)")
    .eq("status", "active")
    .lte("next_send_at", now);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let completed = 0;

  for (const enrollment of enrollments || []) {
    try {
      if (enrollment.step_flows?.status !== "active") continue;

      // 現在のステップのメッセージを取得
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
        completed++;
        continue;
      }

      const currentMessage = messages[enrollment.current_step];
      const lineUserId = enrollment.friends?.line_user_id;

      if (lineUserId && currentMessage) {
        await pushMessage(lineUserId, currentMessage.message_text);
        sent++;

        const nextStep = enrollment.current_step + 1;

        if (nextStep >= messages.length) {
          await supabase
            .from("step_enrollments")
            .update({ current_step: nextStep, status: "completed" })
            .eq("id", enrollment.id);
          completed++;
        } else {
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
        }
      }
    } catch (err) {
      console.error("Step delivery error:", err);
    }
  }

  return NextResponse.json({ sent, completed, processed: (enrollments || []).length });
}
