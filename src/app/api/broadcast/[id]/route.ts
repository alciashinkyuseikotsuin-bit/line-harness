import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findStepOnlySurveyTitles } from "@/lib/blocks-to-line";
import type { MessageBlock } from "@/types/blocks";

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

  const { title, blocks, targetType, targetTags, scheduledAt } = body;

  // ステップ配信専用アンケートは下書き・予約のどの形でも配信に含められない
  if (Array.isArray(blocks)) {
    const stepOnlyTitles = await findStepOnlySurveyTitles(
      blocks as MessageBlock[],
      supabase
    );
    if (stepOnlyTitles.length > 0) {
      return NextResponse.json(
        {
          error: `「${stepOnlyTitles.join("」「")}」はステップ配信専用のアンケートです。一斉・セグメント・予約配信では送信できません`,
        },
        { status: 400 }
      );
    }
  }

  // 予約日時の検証（指定された場合のみ）
  let scheduledAtIso: string | null = null;
  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "予約日時の形式が不正です" }, { status: 400 });
    }
    if (d.getTime() <= Date.now()) {
      return NextResponse.json({ error: "予約日時は現在より未来を指定してください" }, { status: 400 });
    }
    scheduledAtIso = d.toISOString();
  }

  const messageText = Array.isArray(blocks)
    ? blocks
        .filter((b: { type: string; text?: string }) => b.type === "text" && b.text)
        .map((b: { text: string }) => b.text)
        .join("\n")
    : "";

  const updatePayload: Record<string, unknown> = {
    title: title || "",
    message_text: messageText,
    message_blocks: blocks || null,
    target_type: targetType || "all",
    target_tags: Array.isArray(targetTags) ? targetTags : [],
  };
  // 予約日時が指定されている場合は status を 'scheduled' に切り替え
  if (scheduledAtIso) {
    updatePayload.scheduled_at = scheduledAtIso;
    updatePayload.status = "scheduled";
  }

  const { error } = await supabase
    .from("broadcasts")
    .update(updatePayload)
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
