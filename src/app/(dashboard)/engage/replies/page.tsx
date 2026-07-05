"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, MessageSquareText, Edit2, Trash2, Loader2, Sparkles } from "lucide-react";

type AutoReply = {
  id: string;
  name: string;
  keywords: string[];
  match_type: "exact" | "partial";
  reply_text: string;
  add_tags: string[];
  points: number;
  once_per_friend: boolean;
  active: boolean;
  priority: number;
};

const emptyForm = {
  name: "",
  keywords: "",
  match_type: "partial" as "exact" | "partial",
  reply_text: "",
  add_tags: "",
  points: 0,
  once_per_friend: false,
  active: true,
  priority: 0,
};

export default function AutoRepliesPage() {
  const [replies, setReplies] = useState<AutoReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function loadReplies() {
    setLoading(true);
    fetch("/api/auto-replies")
      .then((r) => r.json())
      .then((d) => setReplies(d.replies || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadReplies();
  }, []);

  function startEdit(reply: AutoReply) {
    setEditingId(reply.id);
    setForm({
      name: reply.name,
      keywords: (reply.keywords || []).join(", "),
      match_type: reply.match_type,
      reply_text: reply.reply_text,
      add_tags: (reply.add_tags || []).join(", "),
      points: reply.points,
      once_per_friend: reply.once_per_friend,
      active: reply.active,
      priority: reply.priority,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function submit() {
    setError(null);
    const payload = {
      name: form.name.trim(),
      keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      match_type: form.match_type,
      reply_text: form.reply_text,
      add_tags: form.add_tags.split(",").map((t) => t.trim()).filter(Boolean),
      points: Number(form.points) || 0,
      once_per_friend: form.once_per_friend,
      active: form.active,
      priority: Number(form.priority) || 0,
    };

    setSaving(true);
    try {
      const res = await fetch(
        editingId ? `/api/auto-replies/${editingId}` : "/api/auto-replies",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存に失敗しました");
        return;
      }
      cancelEdit();
      loadReplies();
    } finally {
      setSaving(false);
    }
  }

  async function deleteReply(id: string) {
    const res = await fetch(`/api/auto-replies/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmDelete(null);
      if (editingId === id) cancelEdit();
      loadReplies();
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">キーワード自動応答</h1>
        <p className="text-sm text-muted-foreground">
          友だちが特定のキーワードを送ると自動返信します。タグ付与やポイント付与も同時に設定できます。
          「隠しワードキャンペーン」を作りたい場合は「同じ友だちには1回だけ反応」をONにしてください（例:
          投稿の最後に隠しキーワードを入れておき、送ってくれた人だけに特典メッセージを返す施策など）。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {editingId ? "自動応答を編集" : "新しい自動応答を作成"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">応答名（管理用）</label>
              <Input
                placeholder="例: 予約案内キーワード"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                キーワード（カンマ区切りで複数登録可）
              </label>
              <Input
                placeholder="例: 予約, よやく, 空き状況"
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">一致方法</label>
              <div className="flex gap-3 h-8 items-center">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={form.match_type === "partial"}
                    onChange={() => setForm({ ...form, match_type: "partial" })}
                  />
                  部分一致
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={form.match_type === "exact"}
                    onChange={() => setForm({ ...form, match_type: "exact" })}
                  />
                  完全一致
                </label>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">付与ポイント</label>
              <Input
                type="number"
                value={form.points}
                onChange={(e) => setForm({ ...form, points: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                優先度（複数マッチ時、数値が大きい方を優先）
              </label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">返信文</label>
            <Textarea
              placeholder="キーワードに反応して送る返信メッセージ"
              value={form.reply_text}
              onChange={(e) => setForm({ ...form, reply_text: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              付与タグ（カンマ区切りで複数登録可）
            </label>
            <Input
              placeholder="例: 予約検討中"
              value={form.add_tags}
              onChange={(e) => setForm({ ...form, add_tags: e.target.value })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.once_per_friend}
                onChange={(e) => setForm({ ...form, once_per_friend: e.target.checked })}
                className="rounded"
              />
              同じ友だちには1回だけ反応（隠しワードキャンペーン用）
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded"
              />
              有効にする
            </label>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2">
            <Button
              onClick={submit}
              disabled={saving || !form.name.trim() || !form.reply_text.trim() || !form.keywords.trim()}
              className="bg-[#06C755] hover:bg-[#05b34c]"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {editingId ? "更新する" : "作成"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={cancelEdit}>
                キャンセル
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4" />
              自動応答一覧
            </span>
            <Badge variant="outline">{replies.length}件</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">読み込み中...</p>
          ) : replies.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              自動応答がまだありません。上から作成してください。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名前</TableHead>
                  <TableHead>キーワード</TableHead>
                  <TableHead>タグ / ポイント</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {replies.map((reply) => (
                  <TableRow key={reply.id}>
                    <TableCell>
                      <div className="font-medium text-sm flex items-center gap-1">
                        {reply.once_per_friend && (
                          <Sparkles className="h-3 w-3 text-amber-500" />
                        )}
                        {reply.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-56">
                        {(reply.keywords || []).map((k) => (
                          <Badge key={k} variant="outline" className="text-xs">
                            {k}
                          </Badge>
                        ))}
                        <span className="text-xs text-muted-foreground">
                          ({reply.match_type === "exact" ? "完全一致" : "部分一致"})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 text-xs">
                        {(reply.add_tags || []).map((t) => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                        {reply.points > 0 && (
                          <Badge variant="outline" className="text-xs">
                            +{reply.points}pt
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {reply.active ? (
                        <Badge className="bg-green-100 text-green-700" variant="secondary">
                          有効
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-500" variant="secondary">
                          無効
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(reply)}>
                          <Edit2 className="h-3 w-3 mr-1" />
                          編集
                        </Button>
                        {confirmDelete === reply.id ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>
                              キャンセル
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => deleteReply(reply.id)}
                            >
                              削除する
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmDelete(reply.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
