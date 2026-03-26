import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .rpc("get_unique_tags");

  if (error) {
    // Fallback: get all friends and extract unique tags
    const { data: friends } = await supabase
      .from("friends")
      .select("tags")
      .eq("is_blocked", false);

    const tagSet = new Set<string>();
    (friends || []).forEach((f: any) => {
      (f.tags || []).forEach((t: string) => tagSet.add(t));
    });

    return NextResponse.json({ tags: Array.from(tagSet).sort() });
  }

  return NextResponse.json({ tags: (data || []).map((r: any) => r.tag) });
}
