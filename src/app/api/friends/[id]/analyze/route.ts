import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase";
import { analyzeFriend, isAiConfigured } from "@/lib/ai";
import { generateLiteAnalysis } from "@/lib/lite-analysis";
import { logEvent } from "@/lib/logging";

// AI分析はモデル呼び出しに時間がかかる（Vercel関数のタイムアウト延長）
export const maxDuration = 300;

// 友だちの分析を実行して friends.ai_summary に保存
// body: { level?: "lite" | "ai" }
//   lite = 無料・ルールベース（APIキー不要・即時）
//   ai   = Claude APIによる本格分析（従量課金・デフォルト）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const level = body?.level === "lite" ? "lite" : "ai";

  // === ライト分析（無料）===
  if (level === "lite") {
    const supabase = getSupabaseAdmin();
    try {
      const summary = await generateLiteAnalysis(supabase, id);
      if (!summary) {
        return NextResponse.json(
          { error: "友だちが見つかりません" },
          { status: 404 }
        );
      }
      await supabase
        .from("friends")
        .update({
          ai_summary: summary,
          ai_summary_at: new Date().toISOString(),
        })
        .eq("id", id);
      await logEvent(supabase, id, "ai_analyzed", { level: "lite" });
      return NextResponse.json({ summary, level: "lite" });
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 500 }
      );
    }
  }

  // === AI分析（Claude API・有料）===
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

    await logEvent(supabase, id, "ai_analyzed", { level: "ai" });

    return NextResponse.json({ summary, level: "ai" });
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
