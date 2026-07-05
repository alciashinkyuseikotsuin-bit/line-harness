import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// アンケート一覧取得
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: surveys, error } = await supabase
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
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 各アンケートの回答数とユニーク回答者数を取得
  for (const survey of surveys || []) {
    const { data: rs } = await supabase
      .from("survey_responses")
      .select("friend_id")
      .eq("survey_id", survey.id);
    const responseCount = rs?.length || 0;
    const uniqueRespondents = new Set(
      (rs || []).map((r: { friend_id: string }) => r.friend_id)
    ).size;
    const sentCount = (survey as { sent_count?: number }).sent_count || 0;
    (survey as Record<string, unknown>).response_count = responseCount;
    (survey as Record<string, unknown>).unique_respondents = uniqueRespondents;
    (survey as Record<string, unknown>).response_rate =
      sentCount > 0
        ? Math.round((uniqueRespondents / sentCount) * 1000) / 10
        : 0;
  }

  return NextResponse.json({ surveys });
}

// アンケート作成
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    title,
    description,
    completionMessage,
    questions,
    surveyType,
    diagnosisResults,
  } = body;

  const supabase = getSupabaseAdmin();

  // 種別（診断 or 通常アンケート）。未指定時は従来通り 'survey'
  const normalizedSurveyType = surveyType === "diagnosis" ? "diagnosis" : "survey";

  // アンケート作成
  const { data: survey, error: surveyError } = await supabase
    .from("surveys")
    .insert({
      title,
      description,
      completion_message: completionMessage || null,
      status: "draft",
      survey_type: normalizedSurveyType,
    })
    .select()
    .single();

  if (surveyError || !survey) {
    return NextResponse.json(
      { error: surveyError?.message || "作成に失敗しました" },
      { status: 500 }
    );
  }

  // 質問と選択肢を作成
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const { data: question, error: qError } = await supabase
      .from("survey_questions")
      .insert({
        survey_id: survey.id,
        question_text: q.text,
        sort_order: qi,
      })
      .select()
      .single();

    if (qError || !question) continue;

    for (let ci = 0; ci < q.choices.length; ci++) {
      const c = q.choices[ci];
      await supabase.from("survey_choices").insert({
        question_id: question.id,
        choice_text: c.text,
        tag: c.tag,
        broadcast_message: c.broadcastMessage || null,
        sort_order: ci,
        diagnosis_points: c.diagnosisPoints || {},
      });
    }
  }

  // 診断タイプ定義（診断コンテンツの場合のみ）
  if (
    normalizedSurveyType === "diagnosis" &&
    Array.isArray(diagnosisResults) &&
    diagnosisResults.length > 0
  ) {
    const rows = diagnosisResults
      .filter((r: { typeKey?: string }) => r.typeKey && r.typeKey.trim())
      .map(
        (
          r: {
            typeKey: string;
            title?: string;
            resultMessage?: string;
            addTag?: string;
            sortOrder?: number;
          },
          i: number
        ) => ({
          survey_id: survey.id,
          type_key: r.typeKey.trim(),
          title: r.title || r.typeKey,
          result_message: r.resultMessage || "",
          add_tag: r.addTag || null,
          sort_order: r.sortOrder ?? i,
        })
      );
    if (rows.length > 0) {
      await supabase.from("diagnosis_results").insert(rows);
    }
  }

  return NextResponse.json({ survey });
}
