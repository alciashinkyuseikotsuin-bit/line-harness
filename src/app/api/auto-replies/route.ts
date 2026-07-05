import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAccountFromRequest } from "@/lib/accounts";

// キーワード自動応答 一覧取得
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;

  let query = supabase
    .from("auto_replies")
    .select("*")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ replies: data || [] });
}

// キーワード自動応答 新規作成
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    name,
    keywords,
    match_type,
    reply_text,
    add_tags,
    points,
    once_per_friend,
    active,
    priority,
  } = body;

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedReply = typeof reply_text === "string" ? reply_text.trim() : "";

  if (!trimmedName) {
    return NextResponse.json({ error: "名前を入力してください" }, { status: 400 });
  }
  if (!trimmedReply) {
    return NextResponse.json({ error: "返信文を入力してください" }, { status: 400 });
  }
  if (!Array.isArray(keywords) || keywords.filter((k: string) => k.trim()).length === 0) {
    return NextResponse.json({ error: "キーワードを1つ以上入力してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;

  const { data, error } = await supabase
    .from("auto_replies")
    .insert({
      name: trimmedName,
      keywords: keywords.map((k: string) => k.trim()).filter(Boolean),
      match_type: match_type === "exact" ? "exact" : "partial",
      reply_text: trimmedReply,
      add_tags: Array.isArray(add_tags) ? add_tags.map((t: string) => t.trim()).filter(Boolean) : [],
      points: Number.isFinite(points) ? points : 0,
      once_per_friend: !!once_per_friend,
      active: active === undefined ? true : !!active,
      priority: Number.isFinite(priority) ? priority : 0,
      account_id: accountId ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reply: data });
}
