import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyzeFriend, isAiConfigured } from "@/lib/ai";
import { logEvent } from "@/lib/logging";

// AI分析はモデル呼び出しに時間がかかる（Vercel関数のタイムアウト延長）
export const maxDuration = 300;

// 友だちのAI人物分析を実行して friends.ai_summary に保存
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY が設定されていません。Vercelの環境変数（と .env.local）に追加してください。",
      },
      { status: 501 }
    );
  }

  const supabase = getSupabaseAdmin();

  try {
    const summary = await analyzeFriend(supabase, id);

    await supabase
      .from("friends")
      .update({
        ai_summary: summary,
        ai_summary_at: new Date().toISOString(),
      })
      .eq("id", id);

    await logEvent(supabase, id, "ai_analyzed", {});

    return NextResponse.json({ summary });
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
