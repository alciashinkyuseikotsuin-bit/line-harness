import { messagingApi } from "@line/bot-sdk";
import type { MessageBlock } from "@/types/blocks";
import { getSupabaseAdmin } from "@/lib/supabase";

export const SEND_FEATURES = [
  "keyword_reply", "greeting_survey", "survey_followup", "points", "omikuji",
  "login", "step_flow", "tag_triggered", "link_triggered", "scheduled_broadcast",
  "manual_chat",
] as const;
export type SendFeature = (typeof SEND_FEATURES)[number];
export type SendMode = "off" | "test_only" | "on";
export type SendFeatureToggles = Record<SendFeature, boolean>;
export const DEFAULT_SEND_FEATURE_TOGGLES: SendFeatureToggles = Object.fromEntries(
  SEND_FEATURES.map((feature) => [feature, false])
) as SendFeatureToggles;

function validMode(value: unknown): value is SendMode {
  return value === "off" || value === "test_only" || value === "on";
}

/** Read only global rows. A missing account_id column is the only legacy fallback. */
export async function getSendGateSettings(supabase = getSupabaseAdmin()): Promise<{
  mode: SendMode;
  dbMode: SendMode;
  toggles: SendFeatureToggles;
  environmentMode?: SendMode;
}> {
  let values: Array<{ key: string; value: unknown }> = [];
  try {
    let result = await supabase.from("app_settings").select("key, value")
      .in("key", ["send_mode", "send_feature_toggles"]).is("account_id", null);
    if (result.error && ["42703", "PGRST204"].includes(result.error.code)
      && result.error.message.includes("account_id")) {
      result = await supabase.from("app_settings").select("key, value")
        .in("key", ["send_mode", "send_feature_toggles"]);
    }
    if (!result.error) values = result.data || [];
  } catch { /* DB failures use the same safe defaults as missing rows. */ }

  const modeRows = values.filter((row) => row.key === "send_mode");
  const toggleRows = values.filter((row) => row.key === "send_feature_toggles");
  // Ambiguous global settings must never select an arbitrary enabled row.
  const ambiguous = modeRows.length > 1 || toggleRows.length > 1;
  const modeValue = ambiguous ? undefined : modeRows[0]?.value;
  const candidateMode = modeValue && typeof modeValue === "object" && "mode" in modeValue
    ? modeValue.mode : undefined;
  const dbMode = validMode(candidateMode) ? candidateMode : "off";
  const toggleValue = ambiguous ? undefined : toggleRows[0]?.value;
  const toggles = { ...DEFAULT_SEND_FEATURE_TOGGLES };
  if (toggleValue && typeof toggleValue === "object" && !Array.isArray(toggleValue)) {
    for (const feature of SEND_FEATURES) {
      toggles[feature] = (toggleValue as Record<string, unknown>)[feature] === true;
    }
  }
  const env = process.env.LINE_SEND_MODE;
  const environmentMode = validMode(env) ? env : undefined;
  return { mode: environmentMode || dbMode, dbMode, toggles, environmentMode };
}

type Recipients = { kind: "single"; lineUserId: string } | { kind: "multi"; count?: number };
export async function gateSend(feature: SendFeature, recipients: Recipients, preview?: string): Promise<{ allow: boolean; reason?: string }> {
  let settings: Awaited<ReturnType<typeof getSendGateSettings>>;
  try { settings = await getSendGateSettings(); } catch { settings = { mode: "off", dbMode: "off", toggles: { ...DEFAULT_SEND_FEATURE_TOGGLES } }; }
  let reason: string | undefined;
  let friendId: string | null = null;
  if (settings.mode === "off") reason = "send_mode_off";
  else if (settings.mode === "test_only" && recipients.kind === "multi") reason = "send_mode_test_only_multi_blocked";
  else if (settings.mode === "test_only") {
    try {
      const lineUserId = (recipients as { kind: "single"; lineUserId: string }).lineUserId;
      const { data, error } = await getSupabaseAdmin().from("friends").select("id, tags")
        .eq("line_user_id", lineUserId).maybeSingle();
      friendId = data?.id || null;
      if (error || !Array.isArray(data?.tags) || !data.tags.includes("テスト配信")) reason = "send_mode_test_only_not_test_friend";
    } catch { reason = "send_mode_test_only_not_test_friend"; }
  } else if (!settings.toggles[feature]) reason = `feature_disabled:${feature}`;
  if (!reason) return { allow: true };
  const recipient = recipients.kind === "single" ? recipients.lineUserId : `count=${recipients.count || 0}`;
  console.log(`[SEND_GATE] skipped feature=${feature} reason=${reason} recipient=${recipient}`);
  try {
    await getSupabaseAdmin().from("send_gate_log").insert({ feature, reason, send_mode: settings.mode,
      recipient_line_user_id: recipients.kind === "single" ? recipients.lineUserId : null,
      recipient_count: recipients.kind === "multi" ? recipients.count ?? null : 1,
      friend_id: friendId, preview: preview?.slice(0, 100) || null });
  } catch { /* audit logging must never affect message processing */ }
  return { allow: false, reason };
}

function previewMessages(messages: unknown[]): string | undefined {
  return messages.map((message) => typeof message === "object" && message && "text" in message
    ? String((message as { text?: unknown }).text || "") : "").find(Boolean);
}

// accessToken 省略時は環境変数（メインアカウント）を使う
export function getLineClient(accessToken?: string) {
  const token = accessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "LINEのチャネルアクセストークンが設定されていません。アカウント設定または .env.local を確認してください。"
    );
  }
  return new messagingApi.MessagingApiClient({
    channelAccessToken: token,
  });
}

// ブロック配列をLINEメッセージ配列に変換
export function blocksToLineMessages(blocks: MessageBlock[]): unknown[] {
  return blocks
    .filter((b) => {
      if (b.type === "text") return b.text?.trim();
      if (b.type === "image") return b.url;
      if (b.type === "video") return b.url && b.previewUrl;
      if (b.type === "survey") return b.surveyId;
      return false;
    })
    .map((block) => {
      switch (block.type) {
        case "text":
          return { type: "text", text: block.text };
        case "image":
          return {
            type: "image",
            originalContentUrl: block.url,
            previewImageUrl: block.previewUrl || block.url,
          };
        case "video":
          return {
            type: "video",
            originalContentUrl: block.url,
            previewImageUrl: block.previewUrl,
          };
        default:
          return null;
      }
    })
    .filter(Boolean);
}

// 全友だちに一斉配信（テキスト単体 - 後方互換）
export async function broadcastMessage(text: string, feature: SendFeature, token?: string) {
  if (!(await gateSend(feature, { kind: "multi" }, text)).allow) return null;
  const client = getLineClient(token);
  return client.broadcast({
    messages: [{ type: "text", text }],
  });
}

// 全友だちに一斉配信（複数ブロック対応）
export async function broadcastMessages(messages: unknown[], feature: SendFeature, token?: string) {
  if (!(await gateSend(feature, { kind: "multi" }, previewMessages(messages))).allow) return null;
  const client = getLineClient(token);
  return client.broadcast({ messages: messages as messagingApi.Message[] });
}

// 特定ユーザーにプッシュ送信（テキスト単体 - 後方互換）
export async function pushMessage(userId: string, text: string, feature: SendFeature, token?: string) {
  if (!(await gateSend(feature, { kind: "single", lineUserId: userId }, text)).allow) return null;
  const client = getLineClient(token);
  return client.pushMessage({
    to: userId,
    messages: [{ type: "text", text }],
  });
}

// 特定ユーザーにプッシュ送信（複数ブロック対応）
export async function pushMessages(userId: string, messages: unknown[], feature: SendFeature, token?: string) {
  if (!(await gateSend(feature, { kind: "single", lineUserId: userId }, previewMessages(messages))).allow) return null;
  const client = getLineClient(token);
  return client.pushMessage({
    to: userId,
    messages: messages as messagingApi.Message[],
  });
}

// 複数ユーザーにマルチキャスト送信（テキスト単体 - 後方互換）
export async function multicastMessage(userIds: string[], text: string, feature: SendFeature, token?: string) {
  if (!(await gateSend(feature, { kind: "multi", count: userIds.length }, text)).allow) return null;
  if (userIds.length === 0) return null;
  const client = getLineClient(token);
  return client.multicast({
    to: userIds,
    messages: [{ type: "text", text }],
  });
}

// 複数ユーザーにマルチキャスト送信（複数ブロック対応）
export async function multicastMessages(userIds: string[], messages: unknown[], feature: SendFeature, token?: string) {
  if (!(await gateSend(feature, { kind: "multi", count: userIds.length }, previewMessages(messages))).allow) return null;
  if (userIds.length === 0) return null;
  const client = getLineClient(token);
  return client.multicast({
    to: userIds,
    messages: messages as messagingApi.Message[],
  });
}

// アンケート Flex Message を構築（送信せずに返すのみ）
// broadcast/multicast から再利用するため抽出
export function buildSurveyFlexMessage(
  surveyId: string,
  questionId: string,
  questionText: string,
  choices: { id: string; text: string }[]
) {
  const buttons = choices.map((c) => ({
    type: "button" as const,
    action: {
      type: "postback" as const,
      label: c.text,
      data: `survey=${surveyId}&question=${questionId}&choice=${c.id}`,
      displayText: c.text,
    },
    style: "primary" as const,
    color: "#06C755",
    margin: "sm" as const,
  }));

  return {
    type: "flex" as const,
    altText: `アンケート: ${questionText}`,
    contents: {
      type: "bubble" as const,
      header: {
        type: "box" as const,
        layout: "vertical" as const,
        contents: [
          {
            type: "text" as const,
            text: "アンケート",
            size: "sm" as const,
            color: "#06C755",
            weight: "bold" as const,
          },
        ],
      },
      body: {
        type: "box" as const,
        layout: "vertical" as const,
        contents: [
          {
            type: "text" as const,
            text: questionText,
            size: "md" as const,
            weight: "bold" as const,
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box" as const,
        layout: "vertical" as const,
        spacing: "sm" as const,
        contents: buttons,
      },
    },
  };
}

// アンケートをFlex Messageで送信
export async function sendSurveyMessage(
  userId: string,
  surveyId: string,
  questionId: string,
  questionText: string,
  choices: { id: string; text: string }[],
  feature: SendFeature,
  token?: string
) {
  if (!(await gateSend(feature, { kind: "single", lineUserId: userId }, questionText)).allow) return null;
  const client = getLineClient(token);
  return client.pushMessage({
    to: userId,
    messages: [
      buildSurveyFlexMessage(surveyId, questionId, questionText, choices),
    ],
  });
}

// ユーザープロフィール取得
export async function getUserProfile(userId: string, token?: string) {
  const client = getLineClient(token);
  return client.getProfile(userId);
}
