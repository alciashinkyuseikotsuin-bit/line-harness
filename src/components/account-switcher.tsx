"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";

import { apiFetch, getCurrentAccountId, setCurrentAccountId } from "@/lib/api-client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

type Account = {
  id: string;
  name: string;
  is_default: boolean;
  destination_user_id: string | null;
  uses_env: boolean;
  created_at: string;
};

/**
 * サイドバー上部に常時表示するアカウントバー
 * - 切替: 現在のアカウント名を表示するセレクト（クリックで切替）
 * - 追加: 「＋」ボタンで設定画面のアカウント管理へ
 */
export function AccountSwitcher() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch("/api/accounts")
      .then((res) => res.json())
      .then((data: { accounts?: Account[]; migrated?: boolean }) => {
        const list = data.accounts || [];
        setAccounts(list);

        const current = getCurrentAccountId();
        if (current && list.some((a) => a.id === current)) {
          setSelected(current);
        } else {
          const def = list.find((a) => a.is_default);
          if (def) setSelected(def.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // マイグレーション未実行（アカウント機能なし）の場合のみ非表示
  if (!loaded || accounts.length === 0) return null;

  const handleChange = (id: string) => {
    if (id === selected) return;
    setSelected(id);
    setCurrentAccountId(id);
    window.location.reload();
  };

  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium text-muted-foreground px-1">
        運用中のLINEアカウント
      </div>
      <div className="flex items-center gap-1">
        <Select value={selected} onValueChange={(v) => handleChange(v as string)}>
          <SelectTrigger className="w-full text-xs" title="クリックでアカウントを切替">
            <ArrowLeftRight className="h-3.5 w-3.5 text-[#06C755] shrink-0" />
            {/* SelectValue はIDをそのまま表示してしまうため、名前を自前で描画する */}
            <span className="truncate">
              {(() => {
                const cur = accounts.find((a) => a.id === selected);
                if (!cur) return "アカウントを選択";
                return cur.is_default ? `${cur.name}（メイン）` : cur.name;
              })()}
            </span>
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
                {a.is_default ? "（メイン）" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Link
          href="/settings#accounts"
          title="LINEアカウントを追加"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "h-8 w-8 p-0 shrink-0"
          )}
        >
          <Plus className="h-4 w-4" />
        </Link>
      </div>
      {accounts.length === 1 && (
        <p className="text-[10px] text-muted-foreground px-1 leading-snug">
          「＋」から別の公式LINEを追加できます
        </p>
      )}
    </div>
  );
}
