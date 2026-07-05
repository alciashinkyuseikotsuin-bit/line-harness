"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
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
import { Plus, Sparkle, Edit2, Trash2, Loader2 } from "lucide-react";

type OmikujiItem = {
  id: string;
  fortune: string;
  message: string;
  weight: number;
  active: boolean;
  draws_this_month: number;
};

const emptyForm = {
  fortune: "",
  message: "",
  weight: 1,
  active: true,
};

export default function OmikujiPage() {
  const [items, setItems] = useState<OmikujiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function loadItems() {
    setLoading(true);
    apiFetch("/api/omikuji")
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadItems();
  }, []);

  function startEdit(item: OmikujiItem) {
    setEditingId(item.id);
    setForm({
      fortune: item.fortune,
      message: item.message,
      weight: item.weight,
      active: item.active,
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
      fortune: form.fortune.trim(),
      message: form.message.trim(),
      weight: Number(form.weight) || 1,
      active: form.active,
    };

    setSaving(true);
    try {
      const res = await apiFetch(editingId ? `/api/omikuji/${editingId}` : "/api/omikuji", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存に失敗しました");
        return;
      }
      cancelEdit();
      loadItems();
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: string) {
    const res = await apiFetch(`/api/omikuji/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmDelete(null);
      if (editingId === id) cancelEdit();
      loadItems();
    }
  }

  const totalWeight = items.filter((i) => i.active).reduce((s, i) => s + Math.max(i.weight, 1), 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">おみくじ設定</h1>
        <p className="text-sm text-muted-foreground">
          友だちが「おみくじ」「運勢」「今日の運勢」と送ると、1日1回おみくじを引けます。
          「重み」が大きい項目ほど当たりやすくなります（有効な項目の重みの合計に対する割合で抽選）。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {editingId ? "おみくじ項目を編集" : "新しいおみくじ項目を作成"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">運勢名</label>
              <Input
                placeholder="例: 大吉、中吉、小吉 など"
                value={form.fortune}
                onChange={(e) => setForm({ ...form, fortune: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">重み（抽選されやすさ）</label>
              <Input
                type="number"
                min={1}
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">本文（経営ワンポイント等）</label>
            <Textarea
              placeholder="おみくじを引いた友だちに送るメッセージ本文"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={3}
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="rounded"
            />
            有効にする（抽選対象に含める）
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2">
            <Button
              onClick={submit}
              disabled={saving || !form.fortune.trim() || !form.message.trim()}
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
              <Sparkle className="h-4 w-4" />
              おみくじ項目一覧
            </span>
            <Badge variant="outline">{items.length}件</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">読み込み中...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              おみくじ項目がまだありません。上から作成してください。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>運勢</TableHead>
                  <TableHead>本文</TableHead>
                  <TableHead>重み（出現率）</TableHead>
                  <TableHead>今月の抽選数</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-sm">{item.fortune}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal text-xs text-muted-foreground">
                      {item.message}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.weight}
                      {item.active && totalWeight > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({Math.round((Math.max(item.weight, 1) / totalWeight) * 100)}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{item.draws_this_month}回</TableCell>
                    <TableCell>
                      {item.active ? (
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
                        <Button size="sm" variant="outline" onClick={() => startEdit(item)}>
                          <Edit2 className="h-3 w-3 mr-1" />
                          編集
                        </Button>
                        {confirmDelete === item.id ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>
                              キャンセル
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => deleteItem(item.id)}
                            >
                              削除する
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmDelete(item.id)}
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
