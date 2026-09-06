"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Pencil, Trash2 } from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

const SEND_FEATURE_LABELS: Record<string, string> = {
  keyword_reply: "キーワード自動応答", greeting_survey: "友だち追加時の挨拶・アンケート",
  survey_followup: "アンケートの続き・完了案内", points: "ポイント・特典", omikuji: "おみくじ",
  login: "ログインコード確認", step_flow: "ステップ配信（巡回）", tag_triggered: "タグ追加からの即時配信",
  link_triggered: "リンククリックからの即時配信", scheduled_broadcast: "一斉・予約・アンケート配信", manual_chat: "カルテからの手動送信",
};
const FEATURE_KEYS = Object.keys(SEND_FEATURE_LABELS);
type SendMode = "off" | "test_only" | "on";
type SendGate = {
  mode: SendMode;
  dbMode: SendMode;
  toggles: Record<string, boolean>;
  environmentMode?: SendMode;
  stats: { sent: number | null; skipped: number | null };
};

function isSendGate(value: unknown): value is SendGate {
  if (!value || typeof value !== "object") return false;
  const gate = value as Partial<SendGate>;
  return ["off", "test_only", "on"].includes(gate.mode || "")
    && ["off", "test_only", "on"].includes(gate.dbMode || "")
    && !!gate.toggles && typeof gate.toggles === "object"
    && !!gate.stats && typeof gate.stats === "object";
}

const WEBHOOK_URL = "https://line-harness-mu.vercel.app/api/webhook";

type Account = {
  id: string;
  name: string;
  is_default: boolean;
  destination_user_id: string | null;
  uses_env: boolean;
  created_at: string;
};

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [migrated, setMigrated] = useState(true);
  const [loading, setLoading] = useState(true);

  // 追加フォーム
  const [newName, setNewName] = useState("");
  const [newToken, setNewToken] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  // 編集
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editToken, setEditToken] = useState("");
  const [editSecret, setEditSecret] = useState("");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteError, setDeleteError] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [sendGate, setSendGate] = useState<SendGate | null>(null);
  const [savingGate, setSavingGate] = useState(false);
  const [sendGateError, setSendGateError] = useState("");

  const loadAccounts = () => {
    setLoading(true);
    apiFetch("/api/accounts")
      .then((res) => res.json())
      .then((data: { accounts?: Account[]; migrated?: boolean }) => {
        setAccounts(data.accounts || []);
        setMigrated(data.migrated ?? true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAccounts();
    apiFetch("/api/settings/send-gate")
      .then(async (res) => ({ res, data: await res.json().catch(() => null) }))
      .then(({ res, data }) => {
        if (!res.ok || !isSendGate(data)) {
          setSendGateError(data?.error || "送信制御を読み込めませんでした");
          return;
        }
        setSendGate(data);
      })
      .catch(() => setSendGateError("送信制御を読み込めませんでした"));
  }, []);

  const saveGate = async (next: SendGate) => {
    setSendGateError("");
    setSavingGate(true);
    try {
      const res = await apiFetch("/api/settings/send-gate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next.dbMode, toggles: next.toggles }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !isSendGate({ ...next, ...data, stats: next.stats })) {
        setSendGateError(data?.error || "送信制御を保存できませんでした");
        return;
      }
      setSendGate({ ...next, ...data, stats: next.stats });
    } catch {
      setSendGateError("送信制御を保存できませんでした");
    } finally {
      setSavingGate(false);
    }
  };
  const changeMode = (mode: SendMode) => {
    if (!sendGate || (mode === "on" && !window.confirm("本当に本番送信を有効にしますか？")) || (mode === "off" && !window.confirm("送信を停止しますか？"))) return;
    void saveGate({ ...sendGate, dbMode: mode });
  };

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボード不可の環境では何もしない
    }
  };

  const handleAdd = async () => {
    setAddError("");
    setAdding(true);
    try {
      const res = await apiFetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          channel_access_token: newToken,
          channel_secret: newSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "追加に失敗しました");
        return;
      }
      setNewName("");
      setNewToken("");
      setNewSecret("");
      loadAccounts();
    } catch {
      setAddError("通信エラーが発生しました");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (account: Account) => {
    setEditingId(account.id);
    setEditName(account.name);
    setEditToken("");
    setEditSecret("");
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditToken("");
    setEditSecret("");
    setEditError("");
  };

  const handleSaveEdit = async (id: string) => {
    setEditError("");
    setSaving(true);
    try {
      const body: Record<string, string> = { name: editName };
      if (editToken.trim()) body.channel_access_token = editToken;
      if (editSecret.trim()) body.channel_secret = editSecret;

      const res = await apiFetch(`/api/accounts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "更新に失敗しました");
        return;
      }
      cancelEdit();
      loadAccounts();
    } catch {
      setEditError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`「${name}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    setDeleteError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await apiFetch(`/api/accounts/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError((prev) => ({ ...prev, [id]: data.error || "削除に失敗しました" }));
        return;
      }
      loadAccounts();
    } catch {
      setDeleteError((prev) => ({ ...prev, [id]: "通信エラーが発生しました" }));
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">設定</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">送信制御</CardTitle><CardDescription>LINE送信の安全な有効化と機能ごとの許可を管理します。</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {sendGateError && <p className="text-sm text-destructive">{sendGateError}</p>}
          {!sendGate ? <p className="text-sm text-muted-foreground">読み込み中...</p> : <>
            <p className="text-sm">現在有効なモード: <strong>{sendGate.mode}</strong></p>
            {sendGate.environmentMode && <p className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">環境変数 <code>LINE_SEND_MODE={sendGate.environmentMode}</code> が優先されています（DBの設定は無視されます）。</p>}
            <div className="space-y-2">
              <p className="text-sm font-medium">DBに保存する送信モード</p>
              {([ ["off", "停止中（何も送らない）"], ["test_only", "テストのみ（テスト配信タグの友だちにのみ送る）"], ["on", "本番（設定した機能のみ送る）"] ] as const).map(([mode, label]) => <label className="flex items-center gap-2 text-sm" key={mode}><input type="radio" checked={sendGate.dbMode === mode} disabled={savingGate} onChange={() => changeMode(mode)} />{label}</label>)}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="col-span-full text-sm font-medium">機能別送信許可</p>
              {FEATURE_KEYS.map((feature) => <label key={feature} className="flex items-center justify-between rounded border p-2 text-sm"><span>{SEND_FEATURE_LABELS[feature]}</span><input type="checkbox" checked={!!sendGate.toggles[feature]} disabled={savingGate} onChange={(event) => void saveGate({ ...sendGate, toggles: { ...sendGate.toggles, [feature]: event.target.checked } })} /></label>)}
            </div>
            <div className="flex gap-6 rounded bg-muted p-3 text-sm"><span>直近24時間の送信数: <strong>{sendGate.stats.sent ?? "取得不可"}</strong></span><span>スキップ数: <strong>{sendGate.stats.skipped ?? "取得不可"}</strong></span></div>
          </>}
        </CardContent>
      </Card>

      <Card id="accounts">
        <CardHeader>
          <CardTitle className="text-base">LINEアカウント管理</CardTitle>
          <CardDescription>
            複数のLINE公式アカウントを登録して切り替えながら運用できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {migrated === false && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              マルチアカウント機能はまだ有効化されていません。
              <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">
                migrations/007_multi_account.sql
              </code>
              をSupabaseで実行すると有効になります。
            </div>
          )}

          {/* Webhook URL案内 */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="text-sm font-medium">Webhook URL（全アカウント共通）</div>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={WEBHOOK_URL}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopyWebhook}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              追加した公式LINEのMessaging API設定のWebhook URLにこれを設定し、Webhookの利用をONにしてください。全アカウント共通のURLです（宛先は自動判別）。
            </p>
          </div>

          {/* アカウント一覧 */}
          <div className="space-y-2">
            {loading && (
              <p className="text-sm text-muted-foreground">読み込み中...</p>
            )}
            {!loading && accounts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                アカウントがありません。
              </p>
            )}
            {accounts.map((account) => (
              <div key={account.id} className="rounded-lg border p-3">
                {editingId === account.id ? (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">アカウント名</label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">
                        チャネルアクセストークン（変更する場合のみ入力）
                      </label>
                      <Input
                        type="password"
                        value={editToken}
                        onChange={(e) => setEditToken(e.target.value)}
                        placeholder="変更しない場合は空欄のまま"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">
                        チャネルシークレット（変更する場合のみ入力）
                      </label>
                      <Input
                        type="password"
                        value={editSecret}
                        onChange={(e) => setEditSecret(e.target.value)}
                        placeholder="変更しない場合は空欄のまま"
                        className="font-mono text-sm"
                      />
                    </div>
                    {editError && (
                      <p className="text-sm text-destructive">{editError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-[#06C755] hover:bg-[#05b34c]"
                        onClick={() => handleSaveEdit(account.id)}
                        disabled={saving}
                      >
                        保存
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        キャンセル
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{account.name}</span>
                      {account.is_default ? (
                        <Badge variant="secondary">メイン</Badge>
                      ) : (
                        <Badge variant="outline">追加</Badge>
                      )}
                      {account.uses_env && (
                        <Badge variant="ghost">環境変数を使用中</Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => startEdit(account)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!account.is_default && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleDelete(account.id, account.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {deleteError[account.id] && (
                  <p className="mt-2 text-sm text-destructive">
                    {deleteError[account.id]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <Separator />

          {/* アカウント追加フォーム */}
          <div className="space-y-3">
            <div className="text-sm font-medium">アカウントを追加</div>
            <p className="text-xs text-muted-foreground">
              LINE Developers（developers.line.biz）→ 対象チャネル →
              Messaging API設定 でトークンを発行、チャネル基本設定でシークレットを確認できます。
            </p>
            <div className="space-y-2">
              <Input
                placeholder="アカウント名（例：〇〇サロン公式）"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="text-sm"
              />
              <Input
                type="password"
                placeholder="チャネルアクセストークン"
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                className="font-mono text-sm"
              />
              <Input
                type="password"
                placeholder="チャネルシークレット"
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            {addError && <p className="text-sm text-destructive">{addError}</p>}
            <Button
              className="bg-[#06C755] hover:bg-[#05b34c]"
              onClick={handleAdd}
              disabled={adding}
            >
              追加
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">通知設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">通知先メールアドレス</label>
            <Input
              type="email"
              placeholder="admin@example.com"
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Slack Webhook URL</label>
            <Input
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              className="font-mono text-sm"
            />
          </div>
          <Button className="bg-[#06C755] hover:bg-[#05b34c]">保存</Button>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            危険な操作
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            この操作は取り消せません。すべての配信データとユーザーデータが削除されます。
          </p>
          <Button variant="destructive">全データ削除</Button>
        </CardContent>
      </Card>
    </div>
  );
}
