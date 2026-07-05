import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// キーワード自動応答 更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const { data, error } = await supabase
    .from("auto_replies")
    .update({
      name: trimmedName,
      keywords: keywords.map((k: string) => k.trim()).filter(Boolean),
      match_type: match_type === "exact" ? "exact" : "partial",
      reply_text: trimmedReply,
      add_tags: Array.isArray(add_tags) ? add_tags.map((t: string) => t.trim()).filter(Boolean) : [],
      points: Number.isFinite(points) ? points : 0,
      once_per_friend: !!once_per_friend,
      active: active === undefined ? true : !!active,
      priority: Number.isFinite(priority) ? priority : 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reply: data });
}

// キーワード自動応答 削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("auto_replies").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
