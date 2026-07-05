import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAccountFromRequest } from "@/lib/accounts";

export type PointRules = {
  survey_answer: number;
  survey_complete: number;
  link_click: number;
  omikuji: number;
  daily_message: number;
  keyword_default: number;
};

const DEFAULT_RULES: PointRules = {
  survey_answer: 5,
  survey_complete: 10,
  link_click: 3,
  omikuji: 2,
  daily_message: 1,
  keyword_default: 0,
};

// ポイント付与ルール取得
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;

  let query = supabase
    .from("app_settings")
    .select("value")
    .eq("key", "point_rules");
  if (accountId) {
    query = query.eq("account_id", accountId);
  }
  const { data, error } = await query.maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules: { ...DEFAULT_RULES, ...(data?.value || {}) } });
}

// ポイント付与ルール更新（upsert）
export async function PUT(request: NextRequest) {
  const body = await request.json();

  const rules: PointRules = {
    survey_answer: Number.isFinite(body.survey_answer) ? body.survey_answer : DEFAULT_RULES.survey_answer,
    survey_complete: Number.isFinite(body.survey_complete) ? body.survey_complete : DEFAULT_RULES.survey_complete,
    link_click: Number.isFinite(body.link_click) ? body.link_click : DEFAULT_RULES.link_click,
    omikuji: Number.isFinite(body.omikuji) ? body.omikuji : DEFAULT_RULES.omikuji,
    daily_message: Number.isFinite(body.daily_message) ? body.daily_message : DEFAULT_RULES.daily_message,
    keyword_default: Number.isFinite(body.keyword_default) ? body.keyword_default : DEFAULT_RULES.keyword_default,
  };

  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;

  // アカウント指定時は account_id+key で一意にupsert。未指定時は従来通り key のみ（後方互換）
  const payload: Record<string, unknown> = {
    key: "point_rules",
    value: rules,
    updated_at: new Date().toISOString(),
  };

  const { error } = accountId
    ? await supabase
        .from("app_settings")
        .upsert({ ...payload, account_id: accountId }, { onConflict: "account_id,key" })
    : await supabase.from("app_settings").upsert(payload);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules });
}
