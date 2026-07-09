import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { processDueEnrollmentById } from "@/lib/step-enrollment";
import type { LineAccount } from "@/lib/accounts";

// ステップ配信の実行（定期実行用・保険）
//
// 1通目（delay_minutes=0）は enrollMatchingStepFlows が enroll と同時に
// 即時送信するため、ここで処理されるのは主に2通目以降（日をまたぐ配信）と、
// 即時送信が何らかの理由で失敗した分のリトライ。
export async function POST() {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // 送信すべきエンロールメントのIDだけを取得（実処理は共通関数に委譲）
  const { data: enrollments, error } = await supabase
    .from("step_enrollments")
    .select("id")
    .eq("status", "active")
    .lte("next_send_at", now);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let completed = 0;
  const accountCache = new Map<string, LineAccount | null>();

  for (const enrollment of enrollments || []) {
    try {
      const result = await processDueEnrollmentById(supabase, enrollment.id, accountCache);
      if (result.sent) sent++;
      if (result.completed) completed++;
    } catch (err) {
      console.error("Step delivery error:", err);
    }
  }

  return NextResponse.json({ sent, completed, processed: (enrollments || []).length });
}
