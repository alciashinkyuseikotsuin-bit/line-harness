import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendSurveyMessage } from "@/lib/line";

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

  // 配信対象を取得
  let friendsQuery = supabase
    .from("friends")
    .select("line_user_id, display_name")
    .eq("is_blocked", false);

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
    (a: any, b: any) => a.sort_order - b.sort_order
  );

  let sentCount = 0;
  const sentTo: string[] = [];

  // 最初の質問を対象友だちに送信
  if (questions.length > 0) {
    const firstQ = questions[0];
    const choices = (firstQ.survey_choices || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((c: any) => ({ id: c.id, text: c.choice_text }));

    for (const friend of friends) {
      try {
        await sendSurveyMessage(
          friend.line_user_id,
          survey.id,
          firstQ.id,
          firstQ.question_text,
          choices
        );
        sentCount++;
        sentTo.push(friend.display_name || friend.line_user_id);
      } catch (err) {
        console.error(`Failed to send to ${friend.line_user_id}:`, err);
      }
    }
  }

  // テスト配信の場合はステータスを変えない（下書きのまま）
  if (mode === "all") {
    await supabase
      .from("surveys")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  return NextResponse.json({ sentCount, mode, sentTo });
}
