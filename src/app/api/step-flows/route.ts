import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ステップフロー一覧
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: flows, error } = await supabase
    .from("step_flows")
    .select("*, step_messages(id, message_text, delay_minutes, sort_order)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 各フローの登録者数を取得
  const flowsWithCount = await Promise.all(
    (flows || []).map(async (flow: any) => {
      const { count } = await supabase
        .from("step_enrollments")
        .select("*", { count: "exact", head: true })
        .eq("flow_id", flow.id);

      return {
        ...flow,
        step_messages: (flow.step_messages || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
        enrolled_count: count || 0,
      };
    })
  );

  return NextResponse.json({ flows: flowsWithCount });
}

// ステップフロー作成
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, trigger_tag, trigger_tags, trigger_match_mode, steps, saveAsDraft } = body;

  // 新形式（trigger_tags配列）優先。旧形式（trigger_tag単体）も受け取り後方互換。
  const tagsArray: string[] = Array.isArray(trigger_tags)
    ? trigger_tags.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
    : trigger_tag && typeof trigger_tag === "string" && trigger_tag.trim()
      ? [trigger_tag.trim()]
      : [];

  // 下書きモード: 名前さえあれば保存可。トリガータグ無しでもOK
  if (!name) {
    return NextResponse.json({ error: "名前は必須です" }, { status: 400 });
  }
  if (!saveAsDraft && tagsArray.length === 0) {
    return NextResponse.json(
      { error: "トリガータグ（1つ以上）は必須です" },
      { status: 400 }
    );
  }

  const matchMode: "any" | "all" = trigger_match_mode === "all" ? "all" : "any";

  const supabase = getSupabaseAdmin();

  const { data: flow, error } = await supabase
    .from("step_flows")
    .insert({
      name,
      trigger_tag: tagsArray[0] || null,
      trigger_tags: tagsArray,
      trigger_match_mode: matchMode,
      status: saveAsDraft ? "draft" : "active",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ステップメッセージを追加
  if (steps && steps.length > 0) {
    const messages = steps.map((step: { message_text?: string; message_blocks?: unknown; delay_minutes?: number }, i: number) => ({
      flow_id: flow.id,
      message_text: step.message_text || "",
      message_blocks: step.message_blocks || null,
      delay_minutes: step.delay_minutes || 0,
      sort_order: i,
    }));

    await supabase.from("step_messages").insert(messages);
  }

  return NextResponse.json({ flow });
}
