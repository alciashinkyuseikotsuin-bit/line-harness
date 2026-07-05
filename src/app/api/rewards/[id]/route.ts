import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ポイント特典 更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { threshold, title, message, add_tag, active } = body;

  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!Number.isFinite(threshold) || threshold <= 0) {
    return NextResponse.json({ error: "到達ポイント数を正しく入力してください" }, { status: 400 });
  }
  if (!trimmedTitle) {
    return NextResponse.json({ error: "特典名を入力してください" }, { status: 400 });
  }
  if (!trimmedMessage) {
    return NextResponse.json({ error: "送信メッセージを入力してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("point_rewards")
    .update({
      threshold,
      title: trimmedTitle,
      message: trimmedMessage,
      add_tag: typeof add_tag === "string" && add_tag.trim() ? add_tag.trim() : null,
      active: active === undefined ? true : !!active,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reward: data });
}

// ポイント特典 削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("point_rewards").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
