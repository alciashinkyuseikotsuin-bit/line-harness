// 管理画面・管理APIのアクセス制御
//
// line-harness は友だちの個人情報（LINE ID・名前・タグ・ポイント）と配信機能を持つため、
// ログイン済み（管理者cookie）でなければ一切触れないようにする。
//
// 公開のまま残すのは「外部システムから叩かれる必要がある」4系統のみ:
//   - /api/webhook            … LINEプラットフォーム（署名検証で保護済み）
//   - /l/{code}               … 計測リンクのリダイレクト（読者が踏む・公開が前提）
//   - /api/track/view         … 公式サイト(line-homepage)からの閲覧計測POST
//   - /api/broadcast/process, /api/step-flows/process … Vercel cron
//
// ADMIN_PASSWORD 未設定時: 本番はフェイルクローズ（全ブロック）、開発中のみ素通し。

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isValidSession } from "@/lib/adminSession";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/api/webhook",
  "/l/",
  "/api/track/view",
  "/api/broadcast/process",
  "/api/step-flows/process",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    // 開発中（ローカル）はログインなしで使えるようにする
    if (process.env.NODE_ENV === "development") return NextResponse.next();
    // 本番でパスワード未設定なら安全側に倒して全ブロック
    return NextResponse.json({ error: "admin_password_not_set" }, { status: 503 });
  }

  const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
  if (await isValidSession(cookie, password)) {
    return NextResponse.next();
  }

  // API は 401、画面はログインページへ
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // 静的アセットは対象外
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)",
  ],
};
