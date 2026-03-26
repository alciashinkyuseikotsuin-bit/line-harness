"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Search, Upload, FileUp, X, Loader2, Download, Plus, Tag } from "lucide-react";

type Friend = {
  id: string;
  line_user_id: string;
  display_name: string;
  picture_url: string | null;
  tags: string[];
  is_blocked: boolean;
  joined_at: string;
  last_active_at: string;
};

export default function UsersPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tagInput, setTagInput] = useState<Record<string, string>>({});
  const [showTagInput, setShowTagInput] = useState<string | null>(null);

  function loadFriends() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    fetch(`/api/friends?${params}`)
      .then((r) => r.json())
      .then((d) => setFriends(d.friends || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadFriends();
    fetch("/api/friends/sync", { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading) loadFriends();
  }, [search]);

  async function addTag(friendId: string) {
    const tag = tagInput[friendId]?.trim();
    if (!tag) return;
    await fetch(`/api/friends/${friendId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    setTagInput((prev) => ({ ...prev, [friendId]: "" }));
    setShowTagInput(null);
    loadFriends();
  }

  async function removeTag(friendId: string, tag: string) {
    await fetch(`/api/friends/${friendId}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    loadFriends();
  }

  const handleImport = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setImportResult("CSVファイルを選択してください");
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/friends/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(
          `インポート完了: ${data.imported}人追加 / ${data.skipped}人スキップ（既存） / ${data.failed}人失敗`
        );
        loadFriends();
        if (data.imported > 0) {
          setTimeout(() => setShowImport(false), 3000);
        }
      } else {
        setImportResult(`エラー: ${data.error}`);
      }
    } catch {
      setImportResult("インポートに失敗しました");
    } finally {
      setImporting(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleImport(file);
    },
    [handleImport]
  );

  const downloadTemplate = () => {
    const csv = "line_user_id,display_name,tags\nUxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx,山田太郎,タグ1|タグ2\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "friends_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">友だち一覧</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            全 {friends.length} 人
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImport(!showImport)}
          >
            <Upload className="h-4 w-4 mr-2" />
            CSVインポート
          </Button>
        </div>
      </div>

      {showImport && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">友だちCSVインポート</h3>
              <button onClick={() => setShowImport(false)}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragOver
                  ? "border-[#06C755] bg-green-50"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {importing ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
                  <p className="text-sm text-muted-foreground">
                    インポート中...LINEからプロフィールを取得しています
                  </p>
                </div>
              ) : (
                <>
                  <FileUp className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium mb-1">
                    CSVファイルをドラッグ＆ドロップ
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    または
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    ファイルを選択
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImport(file);
                    }}
                  />
                </>
              )}
            </div>
            <div className="mt-4 flex items-start justify-between">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <strong>対応形式:</strong> line_user_id, display_name, tags を含むCSV
                </p>
                <p>
                  Lステップ / Poster / エルメ 等のエクスポートCSVにも対応
                </p>
                <p>
                  LINE User IDがある場合、自動でプロフィール画像・名前を取得します
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs shrink-0"
                onClick={downloadTemplate}
              >
                <Download className="h-3 w-3 mr-1" />
                テンプレート
              </Button>
            </div>
            {importResult && (
              <div className="mt-3 rounded-md bg-muted px-4 py-2 text-sm">
                {importResult}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="名前で検索..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              読み込み中...
            </p>
          ) : friends.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">
                友だちがいません
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImport(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                CSVから友だちをインポート
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ユーザー</TableHead>
                  <TableHead>友だち追加日</TableHead>
                  <TableHead>最終アクティブ</TableHead>
                  <TableHead>タグ</TableHead>
                  <TableHead>ステータス</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {friends.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {user.picture_url && (
                            <AvatarImage src={user.picture_url} />
                          )}
                          <AvatarFallback className="text-xs bg-[#06C755] text-white">
                            {user.display_name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">
                            {user.display_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {user.line_user_id.startsWith("manual_")
                              ? "手動登録"
                              : `${user.line_user_id.slice(0, 10)}...`}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.joined_at
                        ? new Date(user.joined_at).toLocaleDateString("ja-JP")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.last_active_at
                        ? new Date(user.last_active_at).toLocaleDateString(
                            "ja-JP"
                          )
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap items-center">
                        {(user.tags || []).map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs group cursor-pointer hover:bg-red-50 hover:border-red-300"
                            onClick={() => removeTag(user.id, tag)}
                          >
                            <Tag className="h-3 w-3 mr-1" />
                            {tag}
                            <X className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 text-red-500" />
                          </Badge>
                        ))}
                        {showTagInput === user.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              className="h-6 w-24 text-xs"
                              placeholder="タグ名"
                              value={tagInput[user.id] || ""}
                              onChange={(e) =>
                                setTagInput((prev) => ({
                                  ...prev,
                                  [user.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") addTag(user.id);
                                if (e.key === "Escape") setShowTagInput(null);
                              }}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => addTag(user.id)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="rounded border border-dashed border-muted-foreground/30 px-1.5 py-0.5 text-xs text-muted-foreground hover:border-[#06C755] hover:text-[#06C755]"
                            onClick={() => setShowTagInput(user.id)}
                          >
                            + タグ
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.is_blocked ? (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-500">
                          ブロック
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-700"
                        >
                          アクティブ
                        </Badge>
                      )}
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
