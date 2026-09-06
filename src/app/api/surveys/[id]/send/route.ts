import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendSurveyMessage } from "@/lib/line";
import { getAccountById, resolveToken } from "@/lib/accounts";

// アンケートをLINEで配信
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // リクエストボディからモードを取得
  let mode: "test" | "all" = "test"; // デフォルトはテスト配信（安全側）
  try {
    const body = await request.json();
    mode = body.mode === "all" ? "all" : "test";
  } catch {
    // bodyが空の場合はテストモード
    mode = "test";
  }

  // アンケートと質問・選択肢を取得
  const { data: survey, error } = await supabase
    .from("surveys")
    .select(
      `
      *,
      survey_questions (
        id,
        question_text,
        sort_order,
        survey_choices (
          id,
          choice_text,
          sort_order
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !survey) {
    return NextResponse.json(
      { error: "アンケートが見つかりません" },
      { status: 404 }
    );
  }

  // 重複送信チェック（本配信のみ。テスト配信は何度でも可能）
  if (mode === "all" && survey.status === "active") {
    return NextResponse.json(
      { error: "このアンケートは既に配信済みです。" },
      { status: 400 }
    );
  }

  // アンケートの所属アカウントからトークンを解決
  const account = survey.account_id
    ? await getAccountById(supabase, survey.account_id)
    : null;
  const token = resolveToken(account);

  // 配信対象を取得（アンケートと同じアカウントの友だちのみ）
  let friendsQuery = supabase
    .from("friends")
    .select("id, line_user_id, display_name")
    .eq("is_blocked", false);

  if (survey.account_id) {
    friendsQuery = friendsQuery.eq("account_id", survey.account_id);
  }

  if (mode === "test") {
    // テスト配信: 「テスト配信」タグが付いた友だちのみ（堀優介のみ）
    friendsQuery = friendsQuery.contains("tags", ["テスト配信"]);
  }

  const { data: friends } = await friendsQuery;

  if (!friends || friends.length === 0) {
    return NextResponse.json(
      {
        error:
          mode === "test"
            ? "テスト配信対象（「テスト配信」タグ付き）の友だちがいません"
            : "配信対象の友だちがいません",
      },
      { status: 400 }
    );
  }

  // 質問をソート
  const questions = (survey.survey_questions || []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
  );

  // テスト配信は何度でも可能な設計のため、過去の回答が残っていると
  // 1問目に答えた瞬間に「全問回答済み」と誤認して即完了してしまう。
  // 再送のたびに対象者の過去回答をリセットし、毎回フルに1問目からやり直せるようにする。
  if (mode === "test") {
    await supabase
      .from("survey_responses")
      .delete()
      .eq("survey_id", id)
      .in(
        "friend_id",
        friends.map((f: { id: string }) => f.id)
      );
  }

  let sentCount = 0;
  const sentTo: string[] = [];

  // 最初の質問を対象友だちに送信
  if (questions.length > 0) {
    const firstQ = questions[0];
    const choices = (firstQ.survey_choices || [])
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((c: { id: string; choice_text: string }) => ({ id: c.id, text: c.choice_text }));

    for (const friend of friends) {
      try {
        const sent = await sendSurveyMessage(
          friend.line_user_id,
          survey.id,
          firstQ.id,
          firstQ.question_text,
          choices,
          "scheduled_broadcast",
          token
        );
        if (sent === null) continue;
        sentCount++;
        sentTo.push(friend.display_name || friend.line_user_id);
      } catch (err) {
        console.error(`Failed to send to ${friend.line_user_id}:`, err);
      }
    }
  }

  // ステータス更新と sent_count 加算
  // mode='all' のみ active 化＋送信数加算（テスト配信は集計に含めない）
  if (mode === "all") {
    // 現在の sent_count を取得して加算
    const { data: currentSurvey } = await supabase
      .from("surveys")
      .select("sent_count")
      .eq("id", id)
      .single();
    const prev = currentSurvey?.sent_count || 0;
    await supabase
      .from("surveys")
      .update({
        status: "active",
        sent_count: prev + sentCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  }

  return NextResponse.json({ sentCount, mode, sentTo });
}
