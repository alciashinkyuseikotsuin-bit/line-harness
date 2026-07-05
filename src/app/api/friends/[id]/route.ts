import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logEvent } from "@/lib/logging";

// 友だち詳細（顧客カルテ）取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: friend, error: friendError } = await supabase
    .from("friends")
    .select("*")
    .eq("id", id)
    .single();

  if (friendError || !friend) {
    return NextResponse.json(
      { error: "友だちが見つかりません" },
      { status: 404 }
    );
  }

  const [messagesRes, eventsRes, surveyRes, pointsRes] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("friend_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("friend_events")
      .select("*")
      .eq("friend_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("survey_responses")
      .select(
        `
        id,
        responded_at,
        surveys ( title ),
        survey_questions ( question_text ),
        survey_choices ( choice_text )
      `
      )
      .eq("friend_id", id)
      .order("responded_at", { ascending: false })
      .limit(50),
    supabase
      .from("point_transactions")
      .select("*")
      .eq("friend_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    friend,
    messages: messagesRes.data || [],
    events: eventsRes.data || [],
    surveyResponses: surveyRes.data || [],
    pointTransactions: pointsRes.data || [],
  });
}

// 友だちカルテ更新（メモ・ステージ・タグ・表示名）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { notes, stage, tags, display_name } = body as {
    notes?: string;
    stage?: string;
    tags?: string[];
    display_name?: string;
  };

  const supabase = getSupabaseAdmin();

  const { data: current, error: currentError } = await supabase
    .from("friends")
    .select("stage")
    .eq("id", id)
    .single();

  if (currentError || !current) {
    return NextResponse.json(
      { error: "友だちが見つかりません" },
      { status: 404 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (notes !== undefined) updates.notes = notes;
  if (stage !== undefined) updates.stage = stage;
  if (tags !== undefined) updates.tags = tags;
  if (display_name !== undefined) updates.display_name = display_name;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "更新する項目がありません" },
      { status: 400 }
    );
  }

  const { data: updated, error } = await supabase
    .from("friends")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (stage !== undefined && stage !== current.stage) {
    await logEvent(supabase, id, "stage_change", {
      from: current.stage,
      to: stage,
    });
  }

  return NextResponse.json({ friend: updated });
}
