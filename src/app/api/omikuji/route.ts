import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { jstToday } from "@/lib/engage";
import { getAccountFromRequest } from "@/lib/accounts";

// おみくじ項目 一覧取得（今月の抽選数つき）
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;

  let itemsQuery = supabase
    .from("omikuji_items")
    .select("*")
    .order("created_at", { ascending: true });
  if (accountId) {
    itemsQuery = itemsQuery.eq("account_id", accountId);
  }
  const { data: items, error } = await itemsQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 今月（JST）の月初日
  const monthStart = `${jstToday().slice(0, 7)}-01`;

  const { data: draws } = await supabase
    .from("omikuji_draws")
    .select("item_id")
    .gte("drawn_on", monthStart);

  const drawCounts = new Map<string, number>();
  (draws || []).forEach((d: { item_id: string | null }) => {
    if (!d.item_id) return;
    drawCounts.set(d.item_id, (drawCounts.get(d.item_id) || 0) + 1);
  });

  const withCounts = (items || []).map((item) => ({
    ...item,
    draws_this_month: drawCounts.get(item.id) || 0,
  }));

  return NextResponse.json({ items: withCounts });
}

// おみくじ項目 新規作成
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { fortune, message, weight, active } = body;

  const trimmedFortune = typeof fortune === "string" ? fortune.trim() : "";
  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!trimmedFortune) {
    return NextResponse.json({ error: "運勢名を入力してください" }, { status: 400 });
  }
  if (!trimmedMessage) {
    return NextResponse.json({ error: "本文を入力してください" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;

  const { data, error } = await supabase
    .from("omikuji_items")
    .insert({
      fortune: trimmedFortune,
      message: trimmedMessage,
      weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
      active: active === undefined ? true : !!active,
      account_id: accountId ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
