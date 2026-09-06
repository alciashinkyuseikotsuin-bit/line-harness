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
    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
    .map((q: { id: string; question_text: string; survey_choices: { id: string; choice_text: string; tag: string | null; broadcast_message: string | null; sort_order: number }[] }) => {
      const qResponses = (responses || []).filter(
        (r) => r.question_id === q.id
      );
      const totalResponses = qResponses.length;

      const choices = (q.survey_choices || [])
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
        .map((c) => {
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

  // 診断コンテンツの場合、診断結果分布（各タイプ何人か）を集計する
  const surveyType = survey.survey_type || "survey";
  let diagnosisDistribution: {
    typeKey: string;
    title: string;
    addTag: string | null;
    count: number;
    percent: number;
  }[] = [];
  let diagnosisCompletedCount = 0;

  if (surveyType === "diagnosis") {
    const { data: diagnosisResultRows } = await supabase
      .from("diagnosis_results")
      .select("type_key, title, add_tag, sort_order")
      .eq("survey_id", id)
      .order("sort_order", { ascending: true });

    const { data: scoreResponses } = await supabase
      .from("survey_responses")
      .select("friend_id, question_id, choice_id, survey_choices ( diagnosis_points )")
      .eq("survey_id", id);

    const totalQuestionCount = questions.length;

    // 友だちごとに「回答済み質問セット」と「タイプ別合計点」を集計
    const perFriend = new Map<
      string,
      { questionIds: Set<string>; scores: Record<string, number> }
    >();
    for (const r of scoreResponses || []) {
      const row = r as unknown as {
        friend_id: string;
        question_id: string;
        survey_choices: { diagnosis_points: Record<string, number> | null } | null;
      };
      let entry = perFriend.get(row.friend_id);
      if (!entry) {
        entry = { questionIds: new Set(), scores: {} };
        perFriend.set(row.friend_id, entry);
      }
      entry.questionIds.add(row.question_id);
      const pts = row.survey_choices?.diagnosis_points || {};
      for (const [typeKey, val] of Object.entries(pts)) {
        const n = Number(val);
        if (!Number.isFinite(n)) continue;
        entry.scores[typeKey] = (entry.scores[typeKey] || 0) + n;
      }
    }

    const results = diagnosisResultRows || [];
    const counts: Record<string, number> = {};
    for (const [, entry] of perFriend) {
      // 全問回答済みの友だちのみ「診断完了」として集計（Webhook側の送信条件と揃える）
      if (totalQuestionCount === 0 || entry.questionIds.size < totalQuestionCount) continue;

      const typeKeys = Object.keys(entry.scores);
      if (typeKeys.length === 0 || results.length === 0) continue;

      const maxScore = Math.max(...typeKeys.map((k) => entry.scores[k]));
      const winner = results.find(
        (res) => entry.scores[res.type_key] !== undefined && entry.scores[res.type_key] === maxScore
      );
      if (!winner) continue;

      diagnosisCompletedCount += 1;
      counts[winner.type_key] = (counts[winner.type_key] || 0) + 1;
    }

    diagnosisDistribution = results.map((r) => {
      const count = counts[r.type_key] || 0;
      return {
        typeKey: r.type_key,
        title: r.title,
        addTag: r.add_tag || null,
        count,
        percent:
          diagnosisCompletedCount > 0
            ? Math.round((count / diagnosisCompletedCount) * 1000) / 10
            : 0,
      };
    });
  }

  return NextResponse.json({
    survey: {
      id: survey.id,
      title: survey.title,
      sentCount,
      uniqueRespondents,
      responseRate, // %
      totalResponses: (responses || []).length,
      surveyType,
      diagnosisCompletedCount,
    },
    questions,
    diagnosisDistribution,
  });
}
