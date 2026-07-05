import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { scoreBand } from "@/lib/engagement";
import { jstToday } from "@/lib/engage";

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

  // === エンゲージメント統計 ===
  const jstDayStartUtc = new Date(`${jstToday()}T00:00:00+09:00`).toISOString();

  const [scoresRes, activeTodayRes, inboundTodayRes] = await Promise.all([
    supabase
      .from("friends")
      .select("engagement_score, points")
      .eq("is_blocked", false),
    supabase
      .from("friends")
      .select("*", { count: "exact", head: true })
      .eq("is_blocked", false)
      .gte("last_active_at", jstDayStartUtc),
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("direction", "in")
      .gte("created_at", jstDayStartUtc),
  ]);

  const bands: Record<string, number> = {
    ホット: 0,
    アクティブ: 0,
    ライト: 0,
    休眠: 0,
  };
  let pointsTotal = 0;
  for (const f of scoresRes.data || []) {
    bands[scoreBand(f.engagement_score || 0)]++;
    pointsTotal += f.points || 0;
  }

  return NextResponse.json({
    friendsCount: friendsCount || 0,
    broadcastCount: broadcastCount || 0,
    totalMessages,
    surveyResponses: surveyResponses || 0,
    bands,
    activeToday: activeTodayRes.count || 0,
    inboundToday: inboundTodayRes.count || 0,
    pointsTotal,
  });
}
