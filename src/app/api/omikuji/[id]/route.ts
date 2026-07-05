import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// おみくじ項目 更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { fortune, message, weight, active } = body;

  const trimmedFortune = typeof fortune === "string" ? fortune.trim() : "";
  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!trimmedFortune) {
    return NextResponse.json({ error: "運勢名を入力してください" }, { status: 400 });
  }
  if (!trimmedMessage) {
    return NextResponse.json({ error: "本文を入力してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("omikuji_items")
    .update({
      fortune: trimmedFortune,
      message: trimmedMessage,
      weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
      active: active === undefined ? true : !!active,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

// おみくじ項目 削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("omikuji_items").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
