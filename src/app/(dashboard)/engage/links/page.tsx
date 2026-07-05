"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Link2, Edit2, Trash2, Loader2, Copy, Check } from "lucide-react";

type TrackedLink = {
  id: string;
  code: string;
  name: string;
  dest_url: string;
  add_tag: string | null;
  points: number;
  click_count: number;
  last_clicked_at: string | null;
  created_at: string;
};

const emptyForm = {
  name: "",
  dest_url: "",
  add_tag: "",
  points: 0,
};

export default function LinksPage() {
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function loadLinks() {
    setLoading(true);
    fetch("/api/links")
      .then((r) => r.json())
      .then((d) => setLinks(d.links || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadLinks();
  }, []);

  function startEdit(link: TrackedLink) {
    setEditingId(link.id);
    setShowForm(true);
    setForm({
      name: link.name,
      dest_url: link.dest_url,
      add_tag: link.add_tag || "",
      points: link.points,
    });
  }

  function resetForm() {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        editingId ? `/api/links/${editingId}` : "/api/links",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            dest_url: form.dest_url,
            add_tag: form.add_tag || null,
            points: Number(form.points) || 0,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存に失敗しました");
        return;
      }
      resetForm();
      loadLinks();
    } catch {
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }
    setConfirmDelete(null);
    await fetch(`/api/links/${id}`, { method: "DELETE" });
    loadLinks();
  }

  async function copySnippet(code: string) {
    try {
      await navigator.clipboard.writeText(`{link:${code}}`);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Link2 className="h-6 w-6" />
            リンク計測
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            配信文に <code className="bg-muted px-1 rounded">{"{link:コード}"}</code>{" "}
            と書くと、友だちごとの計測URLに自動変換されます。クリックした人には自動でタグ・ポイントが付きます。
          </p>
        </div>
        <Button
          onClick={() => {
            if (showForm) resetForm();
            else setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          {showForm ? "閉じる" : "リンクを作成"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? "リンクを編集" : "新しい計測リンク"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">リンク名（管理用）</label>
                <Input
                  placeholder="例: 7月セミナー案内LP"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">遷移先URL</label>
                <Input
                  placeholder="https://..."
                  value={form.dest_url}
                  onChange={(e) => setForm({ ...form, dest_url: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  クリック時に付けるタグ（任意）
                </label>
                <Input
                  placeholder="例: 7月セミナー興味あり"
                  value={form.add_tag}
                  onChange={(e) => setForm({ ...form, add_tag: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  クリック時の付与ポイント
                </label>
                <Input
                  type="number"
                  min={0}
                  value={form.points}
                  onChange={(e) =>
                    setForm({ ...form, points: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingId ? "更新する" : "作成する"}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                キャンセル
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">計測リンク一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : links.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              まだ計測リンクがありません。「リンクを作成」から追加してください。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>リンク名</TableHead>
                  <TableHead>貼り付けコード</TableHead>
                  <TableHead>遷移先</TableHead>
                  <TableHead>タグ / pt</TableHead>
                  <TableHead className="text-right">クリック数</TableHead>
                  <TableHead>最終クリック</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium">{link.name}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-mono text-xs"
                        onClick={() => copySnippet(link.code)}
                      >
                        {copiedCode === link.code ? (
                          <Check className="h-3 w-3 mr-1 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3 mr-1" />
                        )}
                        {"{link:" + link.code + "}"}
                      </Button>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {link.dest_url}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 items-center">
                        {link.add_tag && (
                          <Badge variant="secondary">{link.add_tag}</Badge>
                        )}
                        {link.points > 0 && (
                          <Badge variant="outline">+{link.points}pt</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {link.click_count}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {link.last_clicked_at
                        ? new Date(link.last_clicked_at).toLocaleString("ja-JP")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => startEdit(link)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-7 p-0 ${
                            confirmDelete === link.id
                              ? "w-auto px-2 text-red-500"
                              : "w-7 text-muted-foreground"
                          }`}
                          onClick={() => handleDelete(link.id)}
                        >
                          {confirmDelete === link.id ? (
                            "本当に削除？"
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">使い方</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. 上の「リンクを作成」で遷移先URLと（必要なら）タグ・ポイントを設定</p>
          <p>
            2. 一覧の貼り付けコード（例:{" "}
            <code className="bg-muted px-1 rounded">{"{link:ABC123}"}</code>
            ）をコピーして、一斉配信・セグメント配信・ステップ配信の本文に貼る
          </p>
          <p>
            3. 配信時に1人ずつ専用URLへ自動変換 →
            誰がクリックしたかが記録され、タグ・ポイントが自動で付きます
          </p>
          <p>
            4. クリックした人はカルテのタイムラインにも表示。タグを使えば「興味を持った人だけ」にセグメント配信やステップ配信ができます
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
