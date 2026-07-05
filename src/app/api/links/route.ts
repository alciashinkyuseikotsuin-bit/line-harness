import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

async function generateUniqueCode(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const { data } = await supabase
      .from("tracked_links")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!data) return code;
  }
  // 最終手段: タイムスタンプを混ぜて衝突回避
  return `${generateCode()}${Date.now().toString(36).slice(-2)}`.slice(0, 8);
}

// 計測リンク 一覧取得（クリック数・直近クリック日時つき）
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: links, error } = await supabase
    .from("tracked_links")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: clicks } = await supabase
    .from("link_clicks")
    .select("link_id, clicked_at")
    .order("clicked_at", { ascending: false });

  const latestClickByLink = new Map<string, string>();
  (clicks || []).forEach((c: { link_id: string | null; clicked_at: string }) => {
    if (!c.link_id) return;
    if (!latestClickByLink.has(c.link_id)) {
      latestClickByLink.set(c.link_id, c.clicked_at);
    }
  });

  const withClicks = (links || []).map((link) => ({
    ...link,
    last_clicked_at: latestClickByLink.get(link.id) || null,
  }));

  return NextResponse.json({ links: withClicks });
}

// 計測リンク 新規作成（code はサーバー側で自動生成）
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, dest_url, add_tag, points } = body;

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedUrl = typeof dest_url === "string" ? dest_url.trim() : "";

  if (!trimmedName) {
    return NextResponse.json({ error: "リンク名を入力してください" }, { status: 400 });
  }
  if (!trimmedUrl) {
    return NextResponse.json({ error: "遷移先URLを入力してください" }, { status: 400 });
  }
  try {
    new URL(trimmedUrl);
  } catch {
    return NextResponse.json({ error: "遷移先URLの形式が正しくありません" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const code = await generateUniqueCode(supabase);

  const { data, error } = await supabase
    .from("tracked_links")
    .insert({
      code,
      name: trimmedName,
      dest_url: trimmedUrl,
      add_tag: typeof add_tag === "string" && add_tag.trim() ? add_tag.trim() : null,
      points: Number.isFinite(points) ? points : 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ link: data });
}
