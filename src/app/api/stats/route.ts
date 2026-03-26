import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ダッシュボード統計
export async function GET() {
  const supabase = getSupabaseAdmin();

  // 友だち数
  const { count: friendsCount } = await supabase
    .from("friends")
    .select("*", { count: "exact", head: true })
    .eq("is_blocked", false);

  // 今月の配信数
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: broadcastCount } = await supabase
    .from("broadcasts")
    .select("*", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", startOfMonth.toISOString());

  // 総配信メッセージ数
  const { data: broadcasts } = await supabase
    .from("broadcasts")
    .select("delivered_count")
    .eq("status", "sent");

  const totalMessages = (broadcasts || []).reduce(
    (sum, b) => sum + (b.delivered_count || 0),
    0
  );

  // アンケート回答数
  const { count: surveyResponses } = await supabase
    .from("survey_responses")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    friendsCount: friendsCount || 0,
    broadcastCount: broadcastCount || 0,
    totalMessages,
    surveyResponses: surveyResponses || 0,
  });
}
