import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_SEND_FEATURE_TOGGLES,
  getSendGateSettings,
  SEND_FEATURES,
  type SendMode,
} from "@/lib/line";
import { getSupabaseAdmin } from "@/lib/supabase";

const isMode = (value: unknown): value is SendMode =>
  value === "off" || value === "test_only" || value === "on";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const settings = await getSendGateSettings(supabase);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [sent, skipped] = await Promise.all([
      supabase.from("messages").select("id", { count: "exact", head: true })
        .eq("direction", "out").gt("created_at", since),
      supabase.from("send_gate_log").select("id", { count: "exact", head: true })
        .gt("created_at", since),
    ]);
    return NextResponse.json({
      ...settings,
      stats: {
        sent: sent.error ? null : sent.count ?? 0,
        skipped: skipped.error ? null : skipped.count ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: "送信制御の設定を取得できませんでした" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON形式で指定してください" }, { status: 400 });
  }
  if (!body || !isMode(body.mode) || !body.toggles
    || typeof body.toggles !== "object" || Array.isArray(body.toggles)
    || Object.entries(body.toggles).some(([key, value]) =>
      !SEND_FEATURES.includes(key as (typeof SEND_FEATURES)[number]) || typeof value !== "boolean")) {
    return NextResponse.json({ error: "mode と機能別トグルを正しく指定してください" }, { status: 400 });
  }
  const toggles = { ...DEFAULT_SEND_FEATURE_TOGGLES };
  for (const feature of SEND_FEATURES) toggles[feature] = body.toggles[feature] === true;

  try {
    const supabase = getSupabaseAdmin();
    // One transaction prevents a new mode from taking effect with stale toggles.
    // The RPC supports both legacy key-PK and nullable account_id schemas.
    const { error } = await supabase.rpc("set_global_send_gate_settings", {
      mode_value: { mode: body.mode },
      toggles_value: toggles,
    });
    if (error) {
      const missingMigration = ["PGRST202", "42883"].includes(error.code);
      return NextResponse.json({
        error: missingMigration
          ? "migrations/009_send_gate.sql をSupabase SQL Editorで実行してください"
          : "送信制御の設定を保存できませんでした",
      }, { status: 500 });
    }
    const environmentMode = isMode(process.env.LINE_SEND_MODE) ? process.env.LINE_SEND_MODE : undefined;
    return NextResponse.json({ mode: environmentMode || body.mode, dbMode: body.mode, toggles, environmentMode });
  } catch {
    return NextResponse.json({ error: "送信制御の設定を保存できませんでした" }, { status: 500 });
  }
}
