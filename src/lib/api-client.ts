"use client";

/**
 * フロント共通のAPI呼び出しヘルパー
 *
 * 選択中のLINEアカウントIDを localStorage に保持し、
 * すべてのAPIリクエストに x-account-id ヘッダーとして付与する。
 * サーバー側は未指定ならメインアカウントとして扱う（後方互換）。
 */
const STORAGE_KEY = "line-harness-account-id";

export function getCurrentAccountId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setCurrentAccountId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage 不可の環境では何もしない
  }
}

/** fetch のラッパー。/api/ への呼び出しに選択中アカウントIDを自動付与する */
export function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const accountId = getCurrentAccountId();
  if (!accountId) return fetch(input, init);

  const headers = new Headers(init?.headers || {});
  headers.set("x-account-id", accountId);
  return fetch(input, { ...init, headers });
}
