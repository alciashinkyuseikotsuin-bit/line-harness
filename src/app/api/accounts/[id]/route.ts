import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// LINEアカウント更新（名前・トークン・シークレット）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    update.name = body.name.trim();
  }
  // トークン・シークレットは「入力があった時だけ」更新（空欄=変更しない）
  if (typeof body.channel_access_token === "string" && body.channel_access_token.trim()) {
    update.channel_access_token = body.channel_access_token.trim();
  }
  if (typeof body.channel_secret === "string" && body.channel_secret.trim()) {
    update.channel_secret = body.channel_secret.trim();
    // シークレットを変えたら destination を学習し直す
    update.destination_user_id = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "変更内容がありません" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("line_accounts")
    .update(update)
    .eq("id", id)
    .select("id, name, is_default")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ account: data });
}

// LINEアカウント削除（メインは不可・友だちがいる場合は不可）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: account } = await supabase
    .from("line_accounts")
    .select("id, is_default")
    .eq("id", id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "アカウントが見つかりません" }, { status: 404 });
  }
  if (account.is_default) {
    return NextResponse.json(
      { error: "メインアカウントは削除できません" },
      { status: 400 }
    );
  }

  const { count } = await supabase
    .from("friends")
    .select("*", { count: "exact", head: true })
    .eq("account_id", id);

  if ((count || 0) > 0) {
    return NextResponse.json(
      {
        error: `このアカウントには友だちが${count}人います。データ保護のため削除できません。`,
      },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("line_accounts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
