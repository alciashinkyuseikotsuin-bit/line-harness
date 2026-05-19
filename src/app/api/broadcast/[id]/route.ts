import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// 配信1件取得（下書き編集用）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("broadcasts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "配信が見つかりません" },
      { status: 404 }
    );
  }

  return NextResponse.json({ broadcast: data });
}

// 下書き編集（タイトル・blocks・targetType・targetTagsを更新）
// 配信済みは編集禁止
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("broadcasts")
    .select("status")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "配信が見つかりません" }, { status: 404 });
  }
  if (existing.status === "sent") {
    return NextResponse.json(
      { error: "配信済みは編集できません" },
      { status: 400 }
    );
  }

  const { title, blocks, targetType, targetTags } = body;

  const messageText = Array.isArray(blocks)
    ? blocks
        .filter((b: { type: string; text?: string }) => b.type === "text" && b.text)
        .map((b: { text: string }) => b.text)
        .join("\n")
    : "";

  const { error } = await supabase
    .from("broadcasts")
    .update({
      title: title || "",
      message_text: messageText,
      message_blocks: blocks || null,
      target_type: targetType || "all",
      target_tags: Array.isArray(targetTags) ? targetTags : [],
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("broadcasts").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
