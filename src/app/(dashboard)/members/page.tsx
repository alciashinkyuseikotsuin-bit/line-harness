"use client";

// サロン会員管理 — タグ「サロン会員」の付与/解除を1タップで行う専用画面
// 会員は公式サイト「サロンの診察室」の🔒コンテンツ（勉強会アーカイブ等）がすべて見放題になる。
// 入会 → 「会員にする」 / 退会 → 「会員解除」（サイト側は数秒で反映）

import { useEffect, useMemo, useState } from "react";

const MEMBER_TAG = "サロン会員";

interface Friend {
  id: string;
  display_name: string | null;
  picture_url: string | null;
  tags: string[] | null;
  points: number | null;
  joined_at: string | null;
  is_blocked: boolean | null;
}

function isMember(f: Friend): boolean {
  return (f.tags || []).some((t) => t.normalize("NFKC").trim() === MEMBER_TAG);
}

export default function MembersPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/friends");
      const json = await res.json();
      setFriends((json.friends || []) as Friend[]);
    } catch {
      setNotice("友だち一覧の取得に失敗しました");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const members = useMemo(() => friends.filter(isMember), [friends]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return friends
      .filter((f) => (f.display_name || "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [friends, query]);

  const toggleMember = async (friend: Friend, makeMember: boolean) => {
    if (busyId) return;
    const label = friend.display_name || "この友だち";
    if (
      !window.confirm(
        makeMember
          ? `${label} をサロン会員にしますか？（サイトの🔒コンテンツが全部見放題になります）`
          : `${label} の会員を解除しますか？（見放題が止まります。交換済み特典はそのまま見られます）`
      )
    ) {
      return;
    }
    setBusyId(friend.id);
    try {
      const current = friend.tags || [];
      const nextTags = makeMember
        ? [...current.filter((t) => t.normalize("NFKC").trim() !== MEMBER_TAG), MEMBER_TAG]
        : current.filter((t) => t.normalize("NFKC").trim() !== MEMBER_TAG);
      const res = await fetch(`/api/friends/${friend.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTags }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setFriends((prev) =>
        prev.map((f) => (f.id === friend.id ? { ...f, tags: nextTags } : f))
      );
      setNotice(
        makeMember ? `${label} を会員にしました` : `${label} の会員を解除しました`
      );
    } catch {
      setNotice("更新に失敗しました。もう一度お試しください");
    }
    setBusyId(null);
  };

  const FriendRowView = ({
    friend,
    action,
  }: {
    friend: Friend;
    action: "add" | "remove";
  }) => (
    <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3">
      {friend.picture_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={friend.picture_url}
          alt=""
          className="h-9 w-9 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-sm">
          👤
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {friend.display_name || "（名前未取得）"}
        </p>
        <p className="text-xs text-neutral-500">
          {friend.points ?? 0}pt
          {friend.is_blocked ? "・ブロック中" : ""}
        </p>
      </div>
      {action === "add" ? (
        isMember(friend) ? (
          <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">
            会員です
          </span>
        ) : (
          <button
            onClick={() => toggleMember(friend, true)}
            disabled={busyId === friend.id}
            className="rounded-lg bg-[#06C755] px-3.5 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busyId === friend.id ? "更新中…" : "会員にする"}
          </button>
        )
      ) : (
        <button
          onClick={() => toggleMember(friend, false)}
          disabled={busyId === friend.id}
          className="rounded-lg border border-red-200 px-3.5 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        >
          {busyId === friend.id ? "更新中…" : "会員解除"}
        </button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">サロン会員管理</h1>
      <p className="mt-1 text-sm text-neutral-500">
        オンラインサロン「サロンの診察室」（月額¥11,000）の会員を管理します。
        会員は公式サイト資料室の🔒コンテンツがすべて見放題になります。
      </p>

      {notice && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {notice}
        </p>
      )}

      {/* 会員を追加 */}
      <div className="mt-6">
        <h2 className="text-sm font-bold text-neutral-700">
          会員を追加（名前で検索）
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="友だちの表示名で検索…"
          className="mt-2 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
        />
        {query.trim() && (
          <div className="mt-2 space-y-2">
            {searchResults.length === 0 ? (
              <p className="px-1 text-xs text-neutral-500">該当なし</p>
            ) : (
              searchResults.map((f) => (
                <FriendRowView key={f.id} friend={f} action="add" />
              ))
            )}
          </div>
        )}
      </div>

      {/* 現在の会員 */}
      <div className="mt-8">
        <h2 className="text-sm font-bold text-neutral-700">
          現在の会員（{members.length}名）
        </h2>
        <div className="mt-2 space-y-2">
          {loading ? (
            <p className="px-1 text-xs text-neutral-500">読み込み中…</p>
          ) : members.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-white px-4 py-6 text-center text-xs text-neutral-500">
              まだ会員がいません。上の検索から追加してください。
            </p>
          ) : (
            members.map((f) => (
              <FriendRowView key={f.id} friend={f} action="remove" />
            ))
          )}
        </div>
      </div>

      <div className="mt-8 rounded-lg bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-600">
        <p className="font-bold text-neutral-700">仕組みメモ</p>
        <p className="mt-1">
          ・「会員にする」＝友だちにタグ「サロン会員」を付けるだけ。サイト側は開き直せば即反映されます。
          <br />
          ・退会時は「会員解除」でタグが外れ、見放題が止まります（ポイントで交換済みのものは本人の権利としてそのまま残ります）。
          <br />
          ・タグは顧客管理（カルテ）からも編集できますが、表記ゆれを防ぐためこの画面の利用を推奨します。
        </p>
      </div>
    </div>
  );
}
