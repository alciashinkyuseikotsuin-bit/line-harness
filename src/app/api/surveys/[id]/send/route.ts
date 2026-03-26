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

  // 全友だちを取得
  const { data: friends } = await supabase
    .from("friends")
    .select("line_user_id")
    .eq("is_blocked", false);

  if (!friends || friends.length === 0) {
    return NextResponse.json(
      { error: "配信対象の友だちがいません" },
      { status: 400 }
    );
  }

  // 質問をソート
  const questions = (survey.survey_questions || []).sort(
    (a: any, b: any) => a.sort_order - b.sort_order
  );

  let sentCount = 0;

  // 最初の質問を全友だちに送信
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
      } catch (err) {
        console.error(`Failed to send to ${friend.line_user_id}:`, err);
      }
    }
  }

  // ステータスを active に更新
  await supabase
    .from("surveys")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ sentCount });
}
