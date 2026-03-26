import { createClient } from "@supabase/supabase-js";

// サーバーサイド用 (API Routes)
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase の環境変数が設定されていません。.env.local を確認してください。"
    );
  }

  return createClient(url, key);
}

// クライアントサイド用
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase の環境変数が設定されていません。.env.local を確認してください。"
    );
  }

  return createClient(url, key);
}
