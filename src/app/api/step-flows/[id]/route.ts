import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// フロー詳細取得（編集用に message_blocks 含む）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: flow, error } = await supabase
    .from("step_flows")
    .select(
      "*, step_messages(id, message_text, message_blocks, delay_minutes, sort_order)"
    )
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 並び替え
  if (flow?.step_messages) {
    flow.step_messages = flow.step_messages.sort(
      (a: { sort_order: number }, b: { sort_order: number }) =>
        a.sort_order - b.sort_order
    );
  }

  return NextResponse.json({ flow });
}

// フロー更新
// - { status: "active" | "paused" | "draft" } のみ送られた場合は status だけ更新
// - { name, trigger_tags, ..., steps } が送られた場合はメッセージも丸ごと置き換え
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabaseAdmin();

  const { name, trigger_tag, trigger_tags, trigger_match_mode, status, steps } = body;

  // メッセージ再構築モード（steps 指定あり）
  if (Array.isArray(steps)) {
    const tagsArray: string[] = Array.isArray(trigger_tags)
      ? trigger_tags.filter(
          (t: unknown): t is string => typeof t === "string" && t.trim().length > 0
        )
      : trigger_tag && typeof trigger_tag === "string" && trigger_tag.trim()
        ? [trigger_tag.trim()]
        : [];

    const matchMode: "any" | "all" = trigger_match_mode === "all" ? "all" : "any";

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof name === "string") updatePayload.name = name;
    if (tagsArray.length > 0) {
      updatePayload.trigger_tags = tagsArray;
      updatePayload.trigger_tag = tagsArray[0];
      updatePayload.trigger_match_mode = matchMode;
    }
    if (status) updatePayload.status = status;

    const { error: updateError } = await supabase
      .from("step_flows")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 既存メッセージを全削除して再作成
    await supabase.from("step_messages").delete().eq("flow_id", id);

    const messages = steps.map((s: { message_text?: string; message_blocks?: unknown; delay_minutes?: number }, i: number) => ({
      flow_id: id,
      message_text: s.message_text || "",
      message_blocks: s.message_blocks || null,
      delay_minutes: s.delay_minutes || 0,
      sort_order: i,
    }));
    if (messages.length > 0) {
      await supabase.from("step_messages").insert(messages);
    }

    return NextResponse.json({ ok: true, id });
  }

  // 単純なステータス更新（既存挙動）
  const { data, error } = await supabase
    .from("step_flows")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ flow: data });
}

// フロー削除
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("step_flows").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
