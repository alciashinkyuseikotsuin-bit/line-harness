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
  const { name, trigger_tag, steps } = body;

  if (!name || !trigger_tag) {
    return NextResponse.json({ error: "名前とトリガータグは必須です" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: flow, error } = await supabase
    .from("step_flows")
    .insert({ name, trigger_tag })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ステップメッセージを追加
  if (steps && steps.length > 0) {
    const messages = steps.map((step: any, i: number) => ({
      flow_id: flow.id,
      message_text: step.message_text,
      delay_minutes: step.delay_minutes,
      sort_order: i,
    }));

    await supabase.from("step_messages").insert(messages);
  }

  return NextResponse.json({ flow });
}
