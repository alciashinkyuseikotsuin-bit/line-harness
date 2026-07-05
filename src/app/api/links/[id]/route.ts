import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// 計測リンク 更新（code は変更不可）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, dest_url, add_tag, points } = body;

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedUrl = typeof dest_url === "string" ? dest_url.trim() : "";

  if (!trimmedName) {
    return NextResponse.json({ error: "リンク名を入力してください" }, { status: 400 });
  }
  if (!trimmedUrl) {
    return NextResponse.json({ error: "遷移先URLを入力してください" }, { status: 400 });
  }
  try {
    new URL(trimmedUrl);
  } catch {
    return NextResponse.json({ error: "遷移先URLの形式が正しくありません" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("tracked_links")
    .update({
      name: trimmedName,
      dest_url: trimmedUrl,
      add_tag: typeof add_tag === "string" && add_tag.trim() ? add_tag.trim() : null,
      points: Number.isFinite(points) ? points : 0,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ link: data });
}

// 計測リンク 削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("tracked_links").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
