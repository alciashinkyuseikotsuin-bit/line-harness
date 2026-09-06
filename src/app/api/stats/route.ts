import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { scoreBand } from "@/lib/engagement";
import { jstToday } from "@/lib/engage";
import { getAccountFromRequest } from "@/lib/accounts";

// ダッシュボード統計
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;

  // 友だち数
  let friendsCountQuery = supabase
    .from("friends")
    .select("*", { count: "exact", head: true })
    .eq("is_blocked", false);
  if (accountId) friendsCountQuery = friendsCountQuery.eq("account_id", accountId);
  const { count: friendsCount } = await friendsCountQuery;

  // 今月の配信数
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let broadcastCountQuery = supabase
    .from("broadcasts")
    .select("*", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", startOfMonth.toISOString());
  if (accountId) broadcastCountQuery = broadcastCountQuery.eq("account_id", accountId);
  const { count: broadcastCount } = await broadcastCountQuery;

  // 総配信メッセージ数
  let broadcastsQuery = supabase
    .from("broadcasts")
    .select("delivered_count")
    .eq("status", "sent");
  if (accountId) broadcastsQuery = broadcastsQuery.eq("account_id", accountId);
  const { data: broadcasts } = await broadcastsQuery;

  const totalMessages = (broadcasts || []).reduce(
    (sum, b) => sum + (b.delivered_count || 0),
    0
  );

  // アンケート回答数（friends経由でアカウントを絞る）
  const surveyResponsesQuery = accountId
    ? supabase
        .from("survey_responses")
        .select("*, friends!inner(account_id)", { count: "exact", head: true })
        .eq("friends.account_id", accountId)
    : supabase.from("survey_responses").select("*", { count: "exact", head: true });
  const { count: surveyResponses } = await surveyResponsesQuery;

  // === エンゲージメント統計 ===
  const jstDayStartUtc = new Date(`${jstToday()}T00:00:00+09:00`).toISOString();

  let scoresQuery = supabase
    .from("friends")
    .select("engagement_score, points")
    .eq("is_blocked", false);
  if (accountId) scoresQuery = scoresQuery.eq("account_id", accountId);

  let activeTodayQuery = supabase
    .from("friends")
    .select("*", { count: "exact", head: true })
    .eq("is_blocked", false)
    .gte("last_active_at", jstDayStartUtc);
  if (accountId) activeTodayQuery = activeTodayQuery.eq("account_id", accountId);

  const inboundTodayQuery = accountId
    ? supabase
        .from("messages")
        .select("*, friends!inner(account_id)", { count: "exact", head: true })
        .eq("direction", "in")
        .gte("created_at", jstDayStartUtc)
        .eq("friends.account_id", accountId)
    : supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("direction", "in")
        .gte("created_at", jstDayStartUtc);

  const [scoresRes, activeTodayRes, inboundTodayRes] = await Promise.all([
    scoresQuery,
    activeTodayQuery,
    inboundTodayQuery,
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
