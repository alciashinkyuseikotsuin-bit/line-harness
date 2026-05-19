import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// 既存実装互換: GET は tagsマスタ ∪ friends.tags の集計結果を name のみで返却
// /broadcast/segment, /broadcast/step が依存しているので形は崩さない
export async function GET() {
  const supabase = getSupabaseAdmin();

  // friends 集計
  const { data: friends } = await supabase
    .from("friends")
    .select("tags")
    .eq("is_blocked", false);

  const friendTagCounts = new Map<string, number>();
  (friends || []).forEach((f: { tags: string[] | null }) => {
    (f.tags || []).forEach((t: string) => {
      friendTagCounts.set(t, (friendTagCounts.get(t) || 0) + 1);
    });
  });

  // tagsマスタ
  const { data: masterTags } = await supabase
    .from("tags")
    .select("name");

  const allNames = new Set<string>(friendTagCounts.keys());
  (masterTags || []).forEach((t: { name: string }) => allNames.add(t.name));

  const tags = Array.from(allNames).sort();

  // 拡張: details (各タグの付与人数) も同時に返す。既存呼び出しは tags のみ使う
  const details = tags.map((name) => ({
    name,
    count: friendTagCounts.get(name) || 0,
  }));

  return NextResponse.json({ tags, details });
}

// 新規タグをマスタに追加
export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "タグ名を入力してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 既存重複は ON CONFLICT で無視
  const { error } = await supabase
    .from("tags")
    .insert({ name })
    .select()
    .single();

  if (error && !error.message.toLowerCase().includes("duplicate")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, name });
}

// マスタからタグ削除（friendsに付与されているタグは触らない）
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "タグ名を指定してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("name", name);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
