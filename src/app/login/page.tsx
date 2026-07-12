"use client";

// 管理画面ログイン（このページだけ未ログインでも表示される）

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      setError(
        res.status === 401
          ? "パスワードが違います"
          : "ログインに失敗しました。時間をおいてお試しください"
      );
    } catch {
      setError("通信エラー。もう一度お試しください");
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#06C755] text-lg font-bold text-white">
            H
          </div>
          <div>
            <p className="text-sm font-semibold">LINE Harness</p>
            <p className="text-xs text-neutral-500">管理画面ログイン</p>
          </div>
        </div>
        <label className="mt-6 block text-xs font-medium text-neutral-600">
          管理パスワード
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          className="mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
        />
        {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-5 w-full rounded-lg bg-[#06C755] py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "確認中…" : "ログイン"}
        </button>
      </form>
    </div>
  );
}
