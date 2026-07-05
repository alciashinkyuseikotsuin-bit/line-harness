import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreBand } from "@/lib/engagement";

// 分析に使うモデル（環境変数で差し替え可能）
const AI_MODEL = process.env.AI_MODEL || "claude-opus-4-8";

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/** 友だち1人分の分析材料を集めてテキスト化する */
export async function collectFriendContext(
  supabase: SupabaseClient,
  friendId: string
): Promise<{ friend: Record<string, unknown>; context: string } | null> {
  const { data: friend } = await supabase
    .from("friends")
    .select("*")
    .eq("id", friendId)
    .single();
  if (!friend) return null;

  const [messagesRes, eventsRes, responsesRes, pointsRes] = await Promise.all([
    supabase
      .from("messages")
      .select("direction, message_type, content, source, created_at")
      .eq("friend_id", friendId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("friend_events")
      .select("event_type, metadata, created_at")
      .eq("friend_id", friendId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("survey_responses")
      .select(
        `responded_at,
         surveys ( title ),
         survey_questions ( question_text ),
         survey_choices ( choice_text )`
      )
      .eq("friend_id", friendId)
      .order("responded_at", { ascending: false })
      .limit(40),
    supabase
      .from("point_transactions")
      .select("amount, reason, created_at")
      .eq("friend_id", friendId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const lines: string[] = [];
  lines.push(`## 基本情報`);
  lines.push(`- 表示名: ${friend.display_name || "不明"}`);
  lines.push(`- ステータスメッセージ: ${friend.status_message || "なし"}`);
  lines.push(`- 登録日: ${friend.joined_at}`);
  lines.push(`- 最終アクティブ: ${friend.last_active_at}`);
  lines.push(`- ステージ: ${friend.stage || "新規"}`);
  lines.push(`- タグ: ${(friend.tags || []).join(", ") || "なし"}`);
  lines.push(`- ポイント: ${friend.points || 0}pt`);
  lines.push(
    `- エンゲージメントスコア: ${friend.engagement_score || 0}/100（${scoreBand(friend.engagement_score || 0)}）`
  );
  if (friend.notes) lines.push(`- 管理者メモ: ${friend.notes}`);

  const responses = responsesRes.data || [];
  if (responses.length > 0) {
    lines.push(`\n## アンケート・診断の回答`);
    for (const r of responses) {
      const survey = r.surveys as unknown as { title: string } | null;
      const q = r.survey_questions as unknown as { question_text: string } | null;
      const c = r.survey_choices as unknown as { choice_text: string } | null;
      lines.push(
        `- [${survey?.title || "?"}] ${q?.question_text || "?"} → ${c?.choice_text || "?"}`
      );
    }
  }

  const messages = (messagesRes.data || []).slice().reverse();
  if (messages.length > 0) {
    lines.push(`\n## 最近のメッセージ履歴（古い順）`);
    for (const m of messages) {
      const dir = m.direction === "in" ? "友だち" : "こちら";
      const src = m.direction === "out" ? `(${m.source})` : "";
      lines.push(`- ${m.created_at.slice(0, 16)} ${dir}${src}: ${(m.content || "").slice(0, 200)}`);
    }
  }

  const events = eventsRes.data || [];
  if (events.length > 0) {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.event_type] = (counts[e.event_type] || 0) + 1;
    lines.push(`\n## 行動イベント集計（直近60件）`);
    for (const [type, count] of Object.entries(counts)) {
      lines.push(`- ${type}: ${count}回`);
    }
  }

  const points = pointsRes.data || [];
  if (points.length > 0) {
    lines.push(`\n## ポイント履歴`);
    for (const p of points) {
      lines.push(`- ${p.created_at.slice(0, 10)} ${p.amount > 0 ? "+" : ""}${p.amount}pt (${p.reason})`);
    }
  }

  return { friend, context: lines.join("\n") };
}

const ANALYZE_SYSTEM = `あなたはサロン・治療院向けコンサルタント「堀」のLINE公式アカウント運用を支援するCRMアナリストです。
LINE登録者1人分の行動データから、その人の人物像と最適なアプローチを分析します。

読者は堀本人（コンサルタント）。実務でそのまま使える具体性で書いてください。

出力フォーマット（Markdown）:
## 人物像サマリー
（2-3文。職業・状況・温度感の推定）

## 興味・関心
（箇条書き3-5個。データの根拠を添える）

## 現在の温度感
（ホット/温かい/ぬるい/冷めている のどれかと理由）

## おすすめアプローチ
（この人に効く訴求軸・話題・タイミングを具体的に）

## 次の一手
（今すぐできるアクション1つ）

## この人向け配信文サンプル
（LINEでそのまま送れる150字前後の文面。絵文字は控えめに）

注意: データにない事実を断定しない。推定は「〜と思われます」と明示する。`;

/** 友だち1人をAI分析して人物像サマリーを返す */
export async function analyzeFriend(
  supabase: SupabaseClient,
  friendId: string
): Promise<string> {
  const data = await collectFriendContext(supabase, friendId);
  if (!data) throw new Error("友だちが見つかりません");

  const client = getClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: ANALYZE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `以下のLINE登録者を分析してください。\n\n${data.context}`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");
  if (!text) throw new Error("AIから分析結果を取得できませんでした");
  return text;
}

const DRAFT_SYSTEM = `あなたはサロン・治療院向けコンサルタント「堀」のLINE公式アカウントの配信文ライターです。
顧客管理・教育・エンタメを兼ねた、読者との距離が近いLINE配信文を書きます。

ルール:
- LINEで読みやすい改行（2-3行ごとに空行）
- 300字以内を基本とする（指定があればそれに従う）
- 押し売り感を出さない。読者にとっての利益から書き出す
- 絵文字は1配信に2-4個まで
- 差し込み変数 {name} を使うと相手の名前に置き換わることを活用してよい

出力は配信文のみ。前置きや解説は不要。`;

/** セグメント or 個人向けの配信文ドラフトを生成 */
export async function draftMessage(
  supabase: SupabaseClient,
  opts: {
    goal: string;
    friendId?: string;
    targetTags?: string[];
    extraInstructions?: string;
  }
): Promise<string> {
  let audience = "";
  if (opts.friendId) {
    const data = await collectFriendContext(supabase, opts.friendId);
    if (data) {
      audience = `【送る相手のデータ】\n${data.context}`;
    }
  } else if (opts.targetTags && opts.targetTags.length > 0) {
    const { count } = await supabase
      .from("friends")
      .select("*", { count: "exact", head: true })
      .eq("is_blocked", false)
      .overlaps("tags", opts.targetTags);
    audience = `【送る相手】タグ「${opts.targetTags.join(", ")}」を持つ ${count || 0} 人のセグメント`;
  } else {
    audience = "【送る相手】全登録者";
  }

  const client = getClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    system: DRAFT_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          `配信の目的: ${opts.goal}`,
          opts.extraInstructions ? `追加の指示: ${opts.extraInstructions}` : "",
          audience,
          "\n上記に合わせたLINE配信文を1本書いてください。",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");
  if (!text) throw new Error("AIから配信文を取得できませんでした");
  return text;
}
