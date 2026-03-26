"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Users, Tag, Send, X, Loader2 } from "lucide-react";

type TagInfo = {
  name: string;
  count: number;
};

export default function SegmentPage() {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    // 全友だちを取得してタグ別カウントを集計
    fetch("/api/friends")
      .then((r) => r.json())
      .then((d) => {
        const friends = d.friends || [];
        const tagMap: Record<string, number> = {};
        friends.forEach((f: any) => {
          (f.tags || []).forEach((t: string) => {
            tagMap[t] = (tagMap[t] || 0) + 1;
          });
        });
        const tagList = Object.entries(tagMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
        setTags(tagList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedTags.length === 0) {
      setMatchCount(0);
      return;
    }
    // 選択タグにマッチする友だち数を取得
    fetch("/api/friends")
      .then((r) => r.json())
      .then((d) => {
        const friends = d.friends || [];
        const matched = friends.filter((f: any) =>
          selectedTags.some((t) => (f.tags || []).includes(t))
        );
        setMatchCount(matched.length);
      });
  }, [selectedTags]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function sendSegment() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || `セグメント配信（${selectedTags.join(", ")}）`,
          message,
          targetType: "segment",
          targetTags: selectedTags,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`配信完了: ${data.deliveredCount}人に送信しました`);
        setTitle("");
        setMessage("");
        setSelectedTags([]);
        setShowConfirm(false);
      } else {
        setResult(`エラー: ${data.error}`);
      }
    } catch {
      setResult("配信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">セグメント配信</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* タグ選択 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">配信対象タグを選択</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">読み込み中...</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                タグがまだありません。友だちにタグを付けてください。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.name}
                    onClick={() => toggleTag(tag.name)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      selectedTags.includes(tag.name)
                        ? "border-[#06C755] bg-[#06C755]/10 text-[#06C755]"
                        : "border-muted-foreground/30 hover:border-[#06C755]/50"
                    }`}
                  >
                    <Tag className="h-3 w-3" />
                    {tag.name}
                    <span className="text-xs text-muted-foreground">
                      {tag.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedTags.length > 0 && (
              <div className="mt-4 flex items-center gap-2 rounded-md bg-muted px-3 py-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  対象: {matchCount}人
                </span>
                <span className="text-xs text-muted-foreground">
                  （{selectedTags.join(", ")}）
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* メッセージ作成 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">メッセージ作成</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">タイトル（管理用）</label>
              <Input
                placeholder="配信のタイトル"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">メッセージ本文</label>
              <Textarea
                placeholder="配信するメッセージを入力..."
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <Button
              className="w-full bg-[#06C755] hover:bg-[#05b34c]"
              disabled={selectedTags.length === 0 || !message.trim() || sending}
              onClick={() => setShowConfirm(true)}
            >
              <Send className="h-4 w-4 mr-2" />
              配信内容を確認
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 確認ダイアログ */}
      {showConfirm && (
        <Card className="border-[#06C755]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">配信内容の確認</h3>
              <button onClick={() => setShowConfirm(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 mb-6">
              <div>
                <span className="text-sm text-muted-foreground">対象タグ:</span>
                <div className="flex gap-1 mt-1">
                  {selectedTags.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">配信人数:</span>
                <span className="ml-2 font-medium">{matchCount}人</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">メッセージ:</span>
                <div className="mt-1 rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
                  {message}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirm(false)}
              >
                戻る
              </Button>
              <Button
                className="flex-1 bg-[#06C755] hover:bg-[#05b34c]"
                disabled={sending}
                onClick={sendSegment}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                この内容で配信する
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="rounded-md bg-muted px-4 py-3 text-sm">{result}</div>
      )}
    </div>
  );
}
