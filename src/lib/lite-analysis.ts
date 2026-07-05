import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreBand } from "@/lib/engagement";

/**
 * ライト分析（無料・ルールベース）
 *
 * AIを一切使わず、行動データから人物サマリーとおすすめアプローチを組み立てる。
 * 何回実行しても0円。AI分析（Claude API）を使うほどでもない日常の確認用。
 */
export async function generateLiteAnalysis(
  supabase: SupabaseClient,
  friendId: string
): Promise<string | null> {
  const { data: friend } = await supabase
    .from("friends")
    .select("*")
    .eq("id", friendId)
    .single();
  if (!friend) return null;

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    inboundRes,
    clickEventsRes,
    funEventsRes,
    responsesRes,
    clicksRes,
    diagnosisRes,
  ] = await Promise.all([
    supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("friend_id", friendId)
      .eq("direction", "in")
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("friend_events")
      .select("*", { count: "exact", head: true })
      .eq("friend_id", friendId)
      .eq("event_type", "link_click")
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("friend_events")
      .select("*", { count: "exact", head: true })
      .eq("friend_id", friendId)
      .in("event_type", ["omikuji", "keyword_reply"])
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("survey_responses")
      .select(
        `responded_at,
         survey_questions ( question_text ),
         survey_choices ( choice_text )`
      )
      .eq("friend_id", friendId)
      .order("responded_at", { ascending: false })
      .limit(10),
    supabase
      .from("link_clicks")
      .select("clicked_at, tracked_links ( name )")
      .eq("friend_id", friendId)
      .order("clicked_at", { ascending: false })
      .limit(5),
    supabase
      .from("friend_events")
      .select("metadata, created_at")
      .eq("friend_id", friendId)
      .eq("event_type", "diagnosis_complete")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const score: number = friend.engagement_score || 0;
  const band = scoreBand(score);
  const points: number = friend.points || 0;
  const tags: string[] = friend.tags || [];

  const lastActiveDays = friend.last_active_at
    ? Math.floor(
        (Date.now() - new Date(friend.last_active_at).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const inbound30 = inboundRes.count || 0;
  const clicks30 = clickEventsRes.count || 0;
  const fun30 = funEventsRes.count || 0;

  const lines: string[] = [];
  lines.push("【ライト分析（無料・自動）】");
  lines.push("");

  // === 温度感 ===
  lines.push("■ 温度感");
  const lastActiveText =
    lastActiveDays === null
      ? "不明"
      : lastActiveDays === 0
        ? "今日"
        : `${lastActiveDays}日前`;
  lines.push(
    `${band}（スコア ${score}/100）／ 最終アクティブ: ${lastActiveText} ／ ステージ: ${friend.stage || "新規"}`
  );
  lines.push("");

  // === 行動サマリー ===
  lines.push("■ 直近30日の行動");
  lines.push(
    `メッセージ ${inbound30}件 ／ リンククリック ${clicks30}回 ／ おみくじ・キーワード反応 ${fun30}回 ／ 保有ポイント ${points}pt`
  );
  lines.push("");

  // === 興味・関心のヒント ===
  const interests: string[] = [];
  const clicks = (clicksRes.data || []) as unknown as {
    clicked_at: string;
    tracked_links: { name: string } | null;
  }[];
  for (const c of clicks) {
    if (c.tracked_links?.name) {
      interests.push(`「${c.tracked_links.name}」をクリック（${c.clicked_at.slice(0, 10)}）`);
    }
  }
  const diagnosis = (diagnosisRes.data || [])[0] as
    | { metadata: { type_key?: string } }
    | undefined;
  if (diagnosis?.metadata?.type_key) {
    interests.push(`診断結果: ${diagnosis.metadata.type_key}タイプ`);
  }
  const responses = (responsesRes.data || []) as unknown as {
    survey_questions: { question_text: string } | null;
    survey_choices: { choice_text: string } | null;
  }[];
  for (const r of responses.slice(0, 5)) {
    if (r.survey_questions && r.survey_choices) {
      interests.push(
        `${r.survey_questions.question_text} → ${r.survey_choices.choice_text}`
      );
    }
  }
  if (tags.length > 0) {
    interests.push(`タグ: ${tags.join(" / ")}`);
  }

  lines.push("■ 興味・関心のヒント");
  if (interests.length > 0) {
    for (const i of interests.slice(0, 8)) lines.push(`・${i}`);
  } else {
    lines.push("・まだデータが少なく、興味の手がかりがありません（アンケートや診断への誘導がおすすめ）");
  }
  lines.push("");

  // === おすすめアプローチ（ルールベース） ===
  lines.push("■ おすすめアプローチ");
  if (band === "ホット") {
    lines.push(
      "・反応が非常に良い状態。個別メッセージでの具体的な提案（相談・商品案内）を打つのに最適なタイミングです。"
    );
  } else if (band === "アクティブ") {
    lines.push(
      "・接触が続いています。教育コンテンツや診断への誘導で温度をさらに上げましょう。"
    );
  } else if (band === "ライト") {
    lines.push(
      "・接触は薄め。おみくじやポイントなど軽い企画で「毎日触る理由」を作るのが先決です。売り込みはまだ早い。"
    );
  } else {
    lines.push(
      "・休眠状態。掘り起こし配信（限定特典・診断リニューアル告知など）で再接触のきっかけ作りから。反応が無ければ深追いしない。"
    );
  }
  if (clicks30 > 0 && clicks.length > 0 && clicks[0].tracked_links?.name) {
    lines.push(
      `・直近で「${clicks[0].tracked_links.name}」に興味を示しています。この話題からの個別フォローが有効です。`
    );
  }
  if (diagnosis?.metadata?.type_key) {
    lines.push(
      `・診断タイプ（${diagnosis.metadata.type_key}）に合わせた切り口で話すと刺さりやすいです。`
    );
  }
  lines.push("");

  // === 次の一手 ===
  lines.push("■ 次の一手");
  if (band === "ホット" || (band === "アクティブ" && clicks30 > 0)) {
    lines.push("この画面の1:1送信から、興味テーマに触れた個別メッセージを1通。");
  } else if (band === "アクティブ") {
    lines.push("診断コンテンツまたは教育系ステップ配信への誘導を1本。");
  } else if (band === "ライト") {
    lines.push("次回の全体配信で「おみくじ」「ポイント確認」を告知して軽い接触を増やす。");
  } else {
    lines.push("休眠向けセグメント配信の対象に含める（個別対応は不要）。");
  }
  lines.push("");
  lines.push("※もっと深い人物像・文面案が必要なときだけ「AI分析（有料）」を使ってください。");

  return lines.join("\n");
}
