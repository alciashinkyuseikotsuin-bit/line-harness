import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase";
import { draftMessage, isAiConfigured } from "@/lib/ai";
import { getAccountFromRequest } from "@/lib/accounts";

export const maxDuration = 300;

// AIによる配信文ドラフト生成
// body: { goal: string, friendId?: string, targetTags?: string[], extraInstructions?: string }
// ※生成するだけで送信は一切しない
export async function POST(request: NextRequest) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY が設定されていません。Vercelの環境変数（と .env.local）に追加してください。",
      },
      { status: 501 }
    );
  }

  const body = await request.json();
  const { goal, friendId, targetTags, extraInstructions } = body;

  if (!goal || typeof goal !== "string" || !goal.trim()) {
    return NextResponse.json(
      { error: "配信の目的（goal）を入力してください" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;

  // lib/ai.ts の draftMessage 内部カウントはアカウント非対応（全アカウント横断）のため、
  // アカウント指定時はここで正しいセグメント人数を計算し extraInstructions に補足として渡す
  let extra = extraInstructions || undefined;
  if (accountId && Array.isArray(targetTags) && targetTags.length > 0) {
    const { count } = await supabase
      .from("friends")
      .select("*", { count: "exact", head: true })
      .eq("is_blocked", false)
      .eq("account_id", accountId)
      .overlaps("tags", targetTags);
    const note = `（このアカウントでの対象人数は ${count || 0} 人です）`;
    extra = extra ? `${extra}\n${note}` : note;
  }

  try {
    const draft = await draftMessage(supabase, {
      goal: goal.trim(),
      friendId: friendId || undefined,
      targetTags: Array.isArray(targetTags) ? targetTags : undefined,
      extraInstructions: extra,
    });
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY が無効です。キーを確認してください。" },
        { status: 501 }
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "AIのレート制限中です。少し待ってから再実行してください。" },
        { status: 429 }
      );
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `AI APIエラー: ${err.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
