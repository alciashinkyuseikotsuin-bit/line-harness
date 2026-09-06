import type { SupabaseClient } from "@supabase/supabase-js";
import { pushMessages, type SendFeature } from "@/lib/line";
import { logMessage } from "@/lib/logging";
import type { MessageBlock } from "@/types/blocks";
import { blocksToLineMessagesAsync } from "@/lib/blocks-to-line";

export type FriendForPersonalize = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  points?: number;
  stage?: string;
};

/** アプリの公開ベースURL（リンク計測用） */
export function getBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** テキストに差し込み変数 or 計測リンクが含まれているか */
export function needsPersonalization(text: string): boolean {
  return /\{(name|points|stage|link:[^}]+)\}/.test(text);
}

/** ブロック配列のどこかに個別化が必要なテキストがあるか */
export function blocksNeedPersonalization(blocks: MessageBlock[]): boolean {
  return blocks.some(
    (b) => b.type === "text" && b.text && needsPersonalization(b.text)
  );
}

/**
 * 差し込み変数を展開する
 * {name} → 表示名（無ければ「あなた」）
 * {points} → 現在ポイント
 * {stage} → ステージ
 * {link:code} → 計測リンク /l/code?f=friendId
 */
export function renderTemplate(
  text: string,
  friend: FriendForPersonalize
): string {
  const base = getBaseUrl();
  return text
    .replace(/\{name\}/g, friend.display_name || "あなた")
    .replace(/\{points\}/g, String(friend.points ?? 0))
    .replace(/\{stage\}/g, friend.stage || "新規")
    .replace(/\{link:([^}]+)\}/g, (_m, code) => `${base}/l/${code}?f=${friend.id}`);
}

/**
 * 個別化して1人ずつ push 送信する（{name} や {link:} を含む配信用）。
 * 送信ログも記録する。戻り値は送信成功人数。
 */
export async function sendPersonalizedBlocks(
  supabase: SupabaseClient,
  friends: FriendForPersonalize[],
  blocks: MessageBlock[],
  source: string,
  feature: SendFeature,
  metadata?: Record<string, unknown>,
  token?: string
): Promise<number> {
  let sent = 0;
  for (const friend of friends) {
    try {
      const personalized: MessageBlock[] = blocks.map((b) =>
        b.type === "text" && b.text
          ? { ...b, text: renderTemplate(b.text, friend) }
          : b
      );
      const lineMessages = await blocksToLineMessagesAsync(
        personalized,
        supabase
      );
      if (lineMessages.length === 0) continue;

      const result = await pushMessages(friend.line_user_id, lineMessages, feature, token);
      if (result === null) continue;
      sent++;

      const textContent = personalized
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text)
        .join("\n");
      await logMessage(supabase, friend.id, {
        direction: "out",
        content: textContent || `[${blocks.map((b) => b.type).join(",")}]`,
        source,
        metadata: metadata || {},
      });
    } catch (err) {
      console.error("個別送信失敗:", friend.id, err);
    }
  }
  return sent;
}
