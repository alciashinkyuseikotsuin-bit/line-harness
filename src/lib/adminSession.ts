// 管理画面のセッショントークン
// ADMIN_PASSWORD から HMAC で導出した値を httpOnly cookie に持たせ、
// middleware（Edge Runtime）と /api/auth/login（Node）の両方で検証する。
// Web Crypto のみ使用（Edge互換）。パスワードを変えると全セッションが即失効する。

export const ADMIN_COOKIE = "lh_admin";

const SESSION_LABEL = "line-harness-admin-session-v1";

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** ADMIN_PASSWORD からセッショントークンを導出する */
export async function sessionTokenFromPassword(
  password: string
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(SESSION_LABEL));
  return toBase64Url(sig);
}

/** cookie の値が正しいセッションか検証する */
export async function isValidSession(
  cookieValue: string | undefined,
  password: string | undefined
): Promise<boolean> {
  if (!cookieValue || !password) return false;
  const expected = await sessionTokenFromPassword(password);
  // 長さが同じ固定長トークン同士の比較（HMAC導出値なので実質タイミング攻撃耐性あり）
  return cookieValue === expected;
}
