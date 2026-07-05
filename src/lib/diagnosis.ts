import type { SupabaseClient } from "@supabase/supabase-js";

export type DiagnosisOutcome = {
  typeKey: string;
  title: string;
  resultMessage: string;
  addTag: string | null;
  scores: Record<string, number>;
} | null;

/**
 * 診断タイプのアンケートが全問回答完了したときに結果を計算する。
 *
 * 仕組み:
 * - 各選択肢の diagnosis_points ({"タイプA": 2, "タイプB": 1} 形式) を回答分すべて合算
 * - 最高得点のタイプの diagnosis_results を返す（同点は sort_order が小さい方）
 * - survey_type が 'diagnosis' でない場合や結果未定義の場合は null
 */
export async function computeDiagnosisResult(
  supabase: SupabaseClient,
  surveyId: string,
  friendId: string
): Promise<DiagnosisOutcome> {
  const { data: survey } = await supabase
    .from("surveys")
    .select("survey_type")
    .eq("id", surveyId)
    .single();
  if (!survey || survey.survey_type !== "diagnosis") return null;

  // 回答した選択肢の diagnosis_points を集計
  const { data: responses } = await supabase
    .from("survey_responses")
    .select("choice_id, survey_choices ( diagnosis_points )")
    .eq("survey_id", surveyId)
    .eq("friend_id", friendId);

  if (!responses || responses.length === 0) return null;

  const scores: Record<string, number> = {};
  for (const r of responses) {
    const choice = r.survey_choices as unknown as {
      diagnosis_points: Record<string, number> | null;
    } | null;
    const pts = choice?.diagnosis_points || {};
    for (const [typeKey, val] of Object.entries(pts)) {
      const n = Number(val);
      if (!Number.isFinite(n)) continue;
      scores[typeKey] = (scores[typeKey] || 0) + n;
    }
  }

  const typeKeys = Object.keys(scores);
  if (typeKeys.length === 0) return null;

  // 結果定義を取得
  const { data: results } = await supabase
    .from("diagnosis_results")
    .select("type_key, title, result_message, add_tag, sort_order")
    .eq("survey_id", surveyId)
    .order("sort_order", { ascending: true });
  if (!results || results.length === 0) return null;

  // 最高得点タイプ（同点は sort_order 優先 = results の並び順で先勝ち）
  const maxScore = Math.max(...typeKeys.map((k) => scores[k]));
  const winner = results.find(
    (res) => scores[res.type_key] !== undefined && scores[res.type_key] === maxScore
  );
  if (!winner) return null;

  return {
    typeKey: winner.type_key,
    title: winner.title,
    resultMessage: winner.result_message,
    addTag: winner.add_tag || null,
    scores,
  };
}
