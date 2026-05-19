"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Tag as TagIcon, Trash2, Users, Loader2 } from "lucide-react";

type TagDetail = {
  name: string;
  count: number;
};

export default function TagsPage() {
  const [tags, setTags] = useState<TagDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function loadTags() {
    setLoading(true);
    try {
      const res = await fetch("/api/tags");
      const data = await res.json();
      setTags(data.details || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTags();
  }, []);

  async function createTag() {
    const name = newTagName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "タグ作成に失敗しました");
        return;
      }
      setNewTagName("");
      loadTags();
    } finally {
      setCreating(false);
    }
  }

  async function deleteTag(name: string) {
    const res = await fetch("/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setConfirmDelete(null);
      loadTags();
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">タグ管理</h1>
        <p className="text-sm text-muted-foreground">
          手動でタグを作成すると、配信対象や友だちのタグ付け候補として使えます。
          アンケート回答で自動付与されるタグも自動で一覧に表示されます。
        </p>
      </div>

      {/* 新規作成 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            新しいタグを作成
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="例: VIP、初回限定、業種:エステ など"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createTag();
                }
              }}
            />
            <Button
              onClick={createTag}
              disabled={creating || !newTagName.trim()}
              className="bg-[#06C755] hover:bg-[#05b34c]"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              作成
            </Button>
          </div>
          {error && (
            <p className="text-xs text-red-600 mt-2">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* 一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TagIcon className="h-4 w-4" />
              タグ一覧
            </span>
            <Badge variant="outline">{tags.length}件</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              読み込み中...
            </p>
          ) : tags.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              タグがまだありません。上から作成するか、アンケート回答で自動付与されると表示されます。
            </p>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div
                  key={tag.name}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:border-[#06C755]/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <TagIcon className="h-4 w-4 text-[#06C755]" />
                    <span className="font-medium text-sm">{tag.name}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {tag.count}人に付与
                    </span>
                  </div>
                  {confirmDelete === tag.name ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        マスタから削除（友だちのタグは残ります）
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDelete(null)}
                      >
                        キャンセル
                      </Button>
                      <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => deleteTag(tag.name)}
                      >
                        削除する
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDelete(tag.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
