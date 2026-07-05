import { messagingApi } from "@line/bot-sdk";
import type { MessageBlock } from "@/types/blocks";

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
export function blocksToLineMessages(blocks: MessageBlock[]): any[] {
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
export async function broadcastMessage(text: string, token?: string) {
  const client = getLineClient(token);
  return client.broadcast({
    messages: [{ type: "text", text }],
  });
}

// 全友だちに一斉配信（複数ブロック対応）
export async function broadcastMessages(messages: any[], token?: string) {
  const client = getLineClient(token);
  return client.broadcast({ messages });
}

// 特定ユーザーにプッシュ送信（テキスト単体 - 後方互換）
export async function pushMessage(userId: string, text: string, token?: string) {
  const client = getLineClient(token);
  return client.pushMessage({
    to: userId,
    messages: [{ type: "text", text }],
  });
}

// 特定ユーザーにプッシュ送信（複数ブロック対応）
export async function pushMessages(userId: string, messages: any[], token?: string) {
  const client = getLineClient(token);
  return client.pushMessage({
    to: userId,
    messages,
  });
}

// 複数ユーザーにマルチキャスト送信（テキスト単体 - 後方互換）
export async function multicastMessage(userIds: string[], text: string, token?: string) {
  if (userIds.length === 0) return;
  const client = getLineClient(token);
  return client.multicast({
    to: userIds,
    messages: [{ type: "text", text }],
  });
}

// 複数ユーザーにマルチキャスト送信（複数ブロック対応）
export async function multicastMessages(userIds: string[], messages: any[], token?: string) {
  if (userIds.length === 0) return;
  const client = getLineClient(token);
  return client.multicast({
    to: userIds,
    messages,
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
  token?: string
) {
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
