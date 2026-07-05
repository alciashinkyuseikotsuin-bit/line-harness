"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";

import { apiFetch, getCurrentAccountId, setCurrentAccountId } from "@/lib/api-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Account = {
  id: string;
  name: string;
  is_default: boolean;
  destination_user_id: string | null;
  uses_env: boolean;
  created_at: string;
};

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

  // マイグレーション未実行 or アカウントが1件以下なら何も表示しない
  if (!loaded || accounts.length < 2) return null;

  const handleChange = (id: string) => {
    setSelected(id);
    setCurrentAccountId(id);
    window.location.reload();
  };

  return (
    <Select value={selected} onValueChange={(v) => handleChange(v as string)}>
      <SelectTrigger className="w-full text-xs">
        <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue placeholder="アカウントを選択" />
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
  );
}
