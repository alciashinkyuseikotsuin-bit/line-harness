import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

/**
 * マルチアカウント管理
 *
 * line_accounts テーブルで複数のLINE公式アカウントを管理する。
 * channel_access_token / channel_secret が空文字の行は
 * 「環境変数（LINE_CHANNEL_ACCESS_TOKEN 等）を使うメインアカウント」。
 */
export type LineAccount = {
  id: string;
  name: string;
  channel_access_token: string;
  channel_secret: string;
  destination_user_id: string | null;
  is_default: boolean;
};

/** アカウントの実効トークン（空なら環境変数） */
export function resolveToken(account: LineAccount | null): string | undefined {
  if (account?.channel_access_token) return account.channel_access_token;
  return process.env.LINE_CHANNEL_ACCESS_TOKEN;
}

/** アカウントの実効シークレット（空なら環境変数） */
export function resolveSecret(account: LineAccount | null): string | undefined {
  if (account?.channel_secret) return account.channel_secret;
  return process.env.LINE_CHANNEL_SECRET;
}

/** 全アカウント取得（migration未実行でも落ちない） */
export async function getAccounts(
  supabase: SupabaseClient
): Promise<LineAccount[]> {
  try {
    const { data, error } = await supabase
      .from("line_accounts")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data || []) as LineAccount[];
  } catch {
    return [];
  }
}

export async function getAccountById(
  supabase: SupabaseClient,
  id: string
): Promise<LineAccount | null> {
  try {
    const { data } = await supabase
      .from("line_accounts")
      .select("*")
      .eq("id", id)
      .single();
    return (data as LineAccount) || null;
  } catch {
    return null;
  }
}

export async function getDefaultAccount(
  supabase: SupabaseClient
): Promise<LineAccount | null> {
  try {
    const { data } = await supabase
      .from("line_accounts")
      .select("*")
      .eq("is_default", true)
      .limit(1)
      .single();
    return (data as LineAccount) || null;
  } catch {
    return null;
  }
}

/**
 * リクエストから操作対象アカウントを特定する。
 * フロントは x-account-id ヘッダー（または ?account= クエリ）で指定。
 * 未指定・不正ならデフォルトアカウント。
 */
export async function getAccountFromRequest(
  supabase: SupabaseClient,
  request: NextRequest
): Promise<LineAccount | null> {
  const headerId =
    request.headers.get("x-account-id") ||
    request.nextUrl?.searchParams?.get("account") ||
    null;
  if (headerId) {
    const account = await getAccountById(supabase, headerId);
    if (account) return account;
  }
  return getDefaultAccount(supabase);
}

/** 友だちIDから所属アカウントを引く（ポイント特典送信などで使用） */
export async function getAccountForFriend(
  supabase: SupabaseClient,
  friendId: string
): Promise<LineAccount | null> {
  try {
    const { data: friend } = await supabase
      .from("friends")
      .select("account_id")
      .eq("id", friendId)
      .single();
    if (friend?.account_id) {
      return getAccountById(supabase, friend.account_id);
    }
  } catch {
    // account_id カラム未追加（migration 007未実行）の場合
  }
  return getDefaultAccount(supabase);
}
