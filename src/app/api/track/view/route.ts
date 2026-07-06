import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logEvent } from "@/lib/logging";

/**
 * 外部サイト（プレゼント図書館）からのコンテンツ閲覧記録を受け取る公開API
 * POST /api/track/view  body: { f: string(friendId), content: string, title?: string }
 *
 * - 別ドメインから呼ばれるため CORS 対応必須
 * - friend が見つからなくてもエラーにはしない（{ ok: false } を返すだけ）
 * - recalcFriendScore はここでは呼ばない（閲覧のたびに5クエリは過剰。既存の再計算で拾われる）
 * - 同一 friend×content の記録が直近60秒以内にあれば挿入をスキップ（連打対策）
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "リクエストボディが不正です" }, 400);
  }

  const { f, content, title } = (body || {}) as {
    f?: unknown;
    content?: unknown;
    title?: unknown;
  };

  if (typeof f !== "string" || !f.trim()) {
    return json({ error: "f は必須です" }, 400);
  }
  if (typeof content !== "string" || !content.trim()) {
    return json({ error: "content は必須です" }, 400);
  }
  const friendId = f.trim();
  const trimmedTitle = typeof title === "string" && title.trim() ? title.trim() : undefined;

  const supabase = getSupabaseAdmin();

  // 1. friend を検索（存在しなければエラーにせず ok:false）
  const { data: friend } = await supabase
    .from("friends")
    .select("id")
    .eq("id", friendId)
    .maybeSingle();

  if (!friend) {
    return json({ ok: false });
  }

  // 連打対策: 同じ friend×content の記録が直近60秒以内にあれば挿入をスキップ
  const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("friend_events")
    .select("id")
    .eq("friend_id", friend.id)
    .eq("event_type", "content_view")
    .eq("metadata->>content", content)
    .gte("created_at", sixtySecondsAgo)
    .limit(1)
    .maybeSingle();

  if (!recent) {
    await logEvent(supabase, friend.id, "content_view", {
      content,
      ...(trimmedTitle ? { title: trimmedTitle } : {}),
    });
  }

  // 3. 最終アクティブを更新
  await supabase
    .from("friends")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", friend.id);

  return json({ ok: true });
}
