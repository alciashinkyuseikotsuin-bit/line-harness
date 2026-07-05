import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// LINEアカウント一覧（トークン・シークレットは返さない）
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("line_accounts")
    .select("id, name, is_default, destination_user_id, channel_access_token, created_at")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    // migration 007 未実行でも管理画面が落ちないように空を返す
    return NextResponse.json({ accounts: [], migrated: false });
  }

  const accounts = (data || []).map((a) => ({
    id: a.id,
    name: a.name,
    is_default: a.is_default,
    destination_user_id: a.destination_user_id,
    // メインアカウント（トークン空）は環境変数を使用
    uses_env: !a.channel_access_token,
    created_at: a.created_at,
  }));

  return NextResponse.json({ accounts, migrated: true });
}

// LINEアカウント追加
// body: { name, channel_access_token, channel_secret }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const token =
    typeof body.channel_access_token === "string"
      ? body.channel_access_token.trim()
      : "";
  const secret =
    typeof body.channel_secret === "string" ? body.channel_secret.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "アカウント名を入力してください" }, { status: 400 });
  }
  if (!token || !secret) {
    return NextResponse.json(
      {
        error:
          "チャネルアクセストークンとチャネルシークレットを入力してください（LINE Developersで確認できます）",
      },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("line_accounts")
    .insert({
      name,
      channel_access_token: token,
      channel_secret: secret,
      is_default: false,
    })
    .select("id, name, is_default, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ account: data });
}
