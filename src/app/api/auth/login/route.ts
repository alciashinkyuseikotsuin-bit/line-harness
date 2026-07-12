// POST /api/auth/login — 管理画面ログイン
// body: { password }
// 成功: { ok: true } ＋ httpOnly セッションcookie（90日）
// 失敗: 401（1秒の遅延つき・総当たり対策の最低限）

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, sessionTokenFromPassword } from "@/lib/adminSession";

export async function POST(request: NextRequest) {
  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const given = typeof body.password === "string" ? body.password : "";
  // HMAC導出値どうしの比較（固定長・タイミング攻撃耐性）
  const expected = await sessionTokenFromPassword(adminPassword);
  const actual = await sessionTokenFromPassword(given);

  if (actual !== expected) {
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90日
  });
  return res;
}
