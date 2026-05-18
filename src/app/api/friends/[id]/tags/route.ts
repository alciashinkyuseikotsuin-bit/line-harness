import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enrollMatchingStepFlows } from "@/lib/step-enrollment";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { tag } = await request.json();
  if (!tag) return NextResponse.json({ error: "タグを指定してください" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: friend } = await supabase
    .from("friends")
    .select("tags")
    .eq("id", id)
    .single();

  if (!friend) return NextResponse.json({ error: "友だちが見つかりません" }, { status: 404 });

  const currentTags: string[] = friend.tags || [];
  if (currentTags.includes(tag)) {
    return NextResponse.json({ tags: currentTags });
  }

  const newTags = [...currentTags, tag];
  await supabase.from("friends").update({ tags: newTags }).eq("id", id);

  // 更新後のタグセットでマッチするステップフローへ enroll
  await enrollMatchingStepFlows(supabase, id, newTags);

  return NextResponse.json({ tags: newTags });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { tag } = await request.json();
  if (!tag) return NextResponse.json({ error: "タグを指定してください" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: friend } = await supabase
    .from("friends")
    .select("tags")
    .eq("id", id)
    .single();

  if (!friend) return NextResponse.json({ error: "友だちが見つかりません" }, { status: 404 });

  const newTags = (friend.tags || []).filter((t: string) => t !== tag);
  await supabase.from("friends").update({ tags: newTags }).eq("id", id);

  return NextResponse.json({ tags: newTags });
}
