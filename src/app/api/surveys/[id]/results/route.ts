import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// アンケート回答結果取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // アンケート情報取得
  const { data: survey, error: surveyError } = await supabase
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
          tag,
          broadcast_message,
          sort_order
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (surveyError || !survey) {
    return NextResponse.json(
      { error: "アンケートが見つかりません" },
      { status: 404 }
    );
  }

  // 回答データ取得（friend_id 含めてユニーク回答者数を計算）
  const { data: responses } = await supabase
    .from("survey_responses")
    .select("question_id, choice_id, friend_id")
    .eq("survey_id", id);

  // ユニーク回答者数（少なくとも1問でも回答した友だち数）
  const uniqueRespondents = new Set(
    (responses || []).map((r: { friend_id: string }) => r.friend_id)
  ).size;

  // 質問ごとに集計
  const questions = (survey.survey_questions || [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((q: any) => {
      const qResponses = (responses || []).filter(
        (r) => r.question_id === q.id
      );
      const totalResponses = qResponses.length;

      const choices = (q.survey_choices || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((c: any) => {
          const count = qResponses.filter(
            (r) => r.choice_id === c.id
          ).length;
          return {
            id: c.id,
            text: c.choice_text,
            tag: c.tag,
            broadcastMessage: c.broadcast_message,
            count,
            percent:
              totalResponses > 0
                ? Math.round((count / totalResponses) * 1000) / 10
                : 0,
          };
        });

      return {
        id: q.id,
        text: q.question_text,
        totalResponses,
        choices,
      };
    });

  const sentCount = survey.sent_count || 0;
  const responseRate =
    sentCount > 0
      ? Math.round((uniqueRespondents / sentCount) * 1000) / 10
      : 0;

  return NextResponse.json({
    survey: {
      id: survey.id,
      title: survey.title,
      sentCount,
      uniqueRespondents,
      responseRate, // %
      totalResponses: (responses || []).length,
    },
    questions,
  });
}
