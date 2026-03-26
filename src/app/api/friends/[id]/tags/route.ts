import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

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

  // Check if any step flow is triggered by this tag
  const { data: flows } = await supabase
    .from("step_flows")
    .select("id")
    .eq("trigger_tag", tag)
    .eq("status", "active");

  if (flows && flows.length > 0) {
    for (const flow of flows) {
      // Get first step's delay
      const { data: firstStep } = await supabase
        .from("step_messages")
        .select("delay_minutes")
        .eq("flow_id", flow.id)
        .order("sort_order", { ascending: true })
        .limit(1)
        .single();

      const nextSendAt = new Date();
      if (firstStep) {
        nextSendAt.setMinutes(nextSendAt.getMinutes() + firstStep.delay_minutes);
      }

      await supabase.from("step_enrollments").upsert(
        {
          flow_id: flow.id,
          friend_id: id,
          current_step: 0,
          status: "active",
          enrolled_at: new Date().toISOString(),
          next_send_at: nextSendAt.toISOString(),
        },
        { onConflict: "flow_id,friend_id" }
      );
    }
  }

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
