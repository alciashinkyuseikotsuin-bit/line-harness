import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// アンケート1件取得（編集画面用）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

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
          tag,
          broadcast_message,
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

  // 質問・選択肢を sort_order でソート
  const questions = (survey.survey_questions || [])
    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
    .map((q: { id: string; question_text: string; survey_choices: { id: string; choice_text: string; tag: string; broadcast_message: string | null; sort_order: number }[] }) => ({
      id: q.id,
      text: q.question_text,
      type: "single" as const,
      choices: (q.survey_choices || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({
          id: c.id,
          text: c.choice_text,
          tag: c.tag,
          broadcastMessage: c.broadcast_message || "",
          isFreeInput: c.tag?.includes("その他") || false,
        })),
    }));

  return NextResponse.json({
    survey: {
      id: survey.id,
      title: survey.title,
      description: survey.description,
      completionMessage: survey.completion_message || "",
      status: survey.status,
      questions,
    },
  });
}

// アンケート編集（質問・選択肢ごと完全置換）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { title, description, completionMessage, questions } = body;

  const supabase = getSupabaseAdmin();

  // 既存アンケートの存在確認
  const { data: existing } = await supabase
    .from("surveys")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: "アンケートが見つかりません" },
      { status: 404 }
    );
  }

  // タイトル・説明・完了メッセージを更新
  const { error: updateError } = await supabase
    .from("surveys")
    .update({
      title,
      description,
      completion_message: completionMessage || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 既存の質問・選択肢を全削除（CASCADE で survey_choices も消える）
  // survey_responses は choice_id への外部キー ON DELETE CASCADE なので
  // 過去回答も消える点に注意（編集 = 設問構造を変える = 過去回答は無効化）
  await supabase
    .from("survey_questions")
    .delete()
    .eq("survey_id", id);

  // 新しい質問・選択肢を作成
  for (let qi = 0; qi < (questions || []).length; qi++) {
    const q = questions[qi];
    const { data: question, error: qError } = await supabase
      .from("survey_questions")
      .insert({
        survey_id: id,
        question_text: q.text,
        sort_order: qi,
      })
      .select()
      .single();

    if (qError || !question) continue;

    for (let ci = 0; ci < (q.choices || []).length; ci++) {
      const c = q.choices[ci];
      await supabase.from("survey_choices").insert({
        question_id: question.id,
        choice_text: c.text,
        tag: c.tag,
        broadcast_message: c.broadcastMessage || null,
        sort_order: ci,
      });
    }
  }

  return NextResponse.json({ ok: true, id });
}

// アンケート削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("surveys").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
