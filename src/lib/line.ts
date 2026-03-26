import { messagingApi, MessageAPIResponseBase } from "@line/bot-sdk";

export function getLineClient() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "LINE_CHANNEL_ACCESS_TOKEN が設定されていません。.env.local を確認してください。"
    );
  }
  return new messagingApi.MessagingApiClient({
    channelAccessToken: token,
  });
}

// 全友だちに一斉配信
export async function broadcastMessage(text: string) {
  const client = getLineClient();
  return client.broadcast({
    messages: [{ type: "text", text }],
  });
}

// 特定ユーザーにプッシュ送信
export async function pushMessage(userId: string, text: string) {
  const client = getLineClient();
  return client.pushMessage({
    to: userId,
    messages: [{ type: "text", text }],
  });
}

// 複数ユーザーにマルチキャスト送信 (セグメント配信用)
export async function multicastMessage(userIds: string[], text: string) {
  if (userIds.length === 0) return;
  const client = getLineClient();
  return client.multicast({
    to: userIds,
    messages: [{ type: "text", text }],
  });
}

// アンケートをFlex Messageで送信
export async function sendSurveyMessage(
  userId: string,
  surveyId: string,
  questionId: string,
  questionText: string,
  choices: { id: string; text: string }[]
) {
  const client = getLineClient();

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

  return client.pushMessage({
    to: userId,
    messages: [
      {
        type: "flex",
        altText: `アンケート: ${questionText}`,
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "アンケート",
                size: "sm",
                color: "#06C755",
                weight: "bold",
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: questionText,
                size: "md",
                weight: "bold",
                wrap: true,
              },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: buttons,
          },
        },
      },
    ],
  });
}

// ユーザープロフィール取得
export async function getUserProfile(userId: string) {
  const client = getLineClient();
  return client.getProfile(userId);
}
