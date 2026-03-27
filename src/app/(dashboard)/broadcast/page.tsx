"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Send, X, Loader2 } from "lucide-react";
import { LinePreview } from "@/components/line-preview";
import { MessageBlockEditor } from "@/components/message-block-editor";
import type { MessageBlock } from "@/types/blocks";
import { createBlock } from "@/types/blocks";

type Broadcast = {
  id: string;
  title: string;
  message_text: string;
  target_type: string;
  status: string;
  sent_at: string | null;
  delivered_count: number;
  created_at: string;
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent: "bg-green-100 text-green-700",
    scheduled: "bg-blue-100 text-blue-700",
    draft: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    sent: "配信済み",
    scheduled: "予約中",
    draft: "下書き",
  };
  return (
    <Badge variant="secondary" className={styles[status] || styles.draft}>
      {labels[status] || status}
    </Badge>
  );
}

export default function BroadcastPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<MessageBlock[]>([createBlock("text")]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [friendCount, setFriendCount] = useState(0);
  const [testDone, setTestDone] = useState(false);
  const [surveys, setSurveys] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    fetch("/api/broadcast")
      .then((r) => r.json())
      .then((d) => setBroadcasts(d.broadcasts || []))
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch("/api/friends")
      .then((r) => r.json())
      .then((d) => setFriendCount((d.friends || []).length));

    fetch("/api/surveys")
      .then((r) => r.json())
      .then((d) =>
        setSurveys(
          (d.surveys || []).map((s: any) => ({ id: s.id, title: s.title }))
        )
      )
      .catch(() => {});
  }, []);

  const hasContent = blocks.some((b) => {
    if (b.type === "text") return b.text?.trim();
    if (b.type === "image") return b.url;
    if (b.type === "video") return b.url && b.previewUrl;
    if (b.type === "survey") return b.surveyId;
    return false;
  });

  // テスト配信（堀優介のみ）
  async function sendTestBroadcast() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[テスト] ${title || "一斉配信"}`,
          blocks,
          targetType: "segment",
          targetTags: ["テスト配信"],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(
          `✅ テスト配信完了: ${data.deliveredCount}人に送信しました（テスト配信タグの友だちのみ）`
        );
        setTestDone(true);
      } else {
        setResult(`❌ エラー: ${data.error}`);
      }
    } catch {
      setResult("❌ テスト配信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  // 本配信（全員）
  async function sendBroadcast() {
    if (!testDone) {
      alert("先にテスト配信を行ってください");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "一斉配信",
          blocks,
          targetType: "all",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`配信完了: ${data.deliveredCount}人に送信しました`);
        setShowCreate(false);
        setShowConfirm(false);
        setTitle("");
        setBlocks([createBlock("text")]);
        setTestDone(false);
        const listRes = await fetch("/api/broadcast");
        const listData = await listRes.json();
        setBroadcasts(listData.broadcasts || []);
      } else {
        setResult(`エラー: ${data.error}`);
      }
    } catch {
      setResult("配信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  const sentBroadcasts = broadcasts.filter((b) => b.status === "sent");
  const totalDelivered = sentBroadcasts.reduce(
    (s, b) => s + (b.delivered_count || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">一斉配信</h1>
        <Button
          className="bg-[#06C755] hover:bg-[#05b34c]"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          新規配信
        </Button>
      </div>

      {/* 新規配信フォーム */}
      {showCreate && !showConfirm && (
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <Card className="border-[#06C755]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold">新規一斉配信</h3>
                <button onClick={() => setShowCreate(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    タイトル（管理用）
                  </label>
                  <Input
                    placeholder="配信のタイトル"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    メッセージ（最大5ブロック）
                  </label>
                  <MessageBlockEditor
                    blocks={blocks}
                    onChange={setBlocks}
                    surveys={surveys}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  配信対象: 全友だち（{friendCount}人）
                </div>
                <Button
                  className="w-full bg-[#06C755] hover:bg-[#05b34c]"
                  disabled={!hasContent}
                  onClick={() => setShowConfirm(true)}
                >
                  <Send className="h-4 w-4 mr-2" />
                  配信内容を確認
                </Button>
              </div>
            </CardContent>
          </Card>
          <LinePreview blocks={blocks} />
        </div>
      )}

      {/* 確認ダイアログ */}
      {showConfirm && (
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <Card className="border-[#06C755] border-2">
            <CardContent className="pt-6">
              <h3 className="font-bold text-lg mb-4">配信内容の確認</h3>
              <div className="space-y-3 mb-6">
                <div>
                  <span className="text-sm text-muted-foreground">対象:</span>
                  <span className="ml-2 font-medium">
                    全友だち（{friendCount}人）
                  </span>
                </div>
                {title && (
                  <div>
                    <span className="text-sm text-muted-foreground">
                      タイトル:
                    </span>
                    <span className="ml-2">{title}</span>
                  </div>
                )}
                <div>
                  <span className="text-sm text-muted-foreground">
                    ブロック数:
                  </span>
                  <span className="ml-2">{blocks.length}ブロック</span>
                </div>
              </div>

              {result && (
                <div
                  className={`rounded-md px-4 py-3 text-sm mb-4 ${
                    result.startsWith("✅")
                      ? "bg-green-50 text-green-800 border border-green-200"
                      : result.startsWith("❌")
                        ? "bg-red-50 text-red-800 border border-red-200"
                        : "bg-muted"
                  }`}
                >
                  {result}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowConfirm(false);
                    setTestDone(false);
                    setResult(null);
                  }}
                >
                  戻って編集
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-[#06C755] text-[#06C755] hover:bg-[#06C755]/10"
                  disabled={sending}
                  onClick={sendTestBroadcast}
                >
                  {sending && !testDone ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  テスト配信（堀優介のみ）
                </Button>
                <Button
                  className={`flex-1 ${testDone ? "bg-[#06C755] hover:bg-[#05b34c]" : "bg-gray-300 cursor-not-allowed"}`}
                  disabled={sending || !testDone}
                  onClick={sendBroadcast}
                >
                  {sending && testDone ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {testDone ? "全員に配信する" : "先にテスト配信してください"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <LinePreview blocks={blocks} />
        </div>
      )}

      {result && !showCreate && !showConfirm && (
        <div className="rounded-md bg-muted px-4 py-3 text-sm">{result}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              配信回数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sentBroadcasts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              総配信メッセージ数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalDelivered.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              全配信履歴
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{broadcasts.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              読み込み中...
            </p>
          ) : broadcasts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              配信履歴がありません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>タイトル</TableHead>
                  <TableHead>配信日時</TableHead>
                  <TableHead>対象</TableHead>
                  <TableHead>配信数</TableHead>
                  <TableHead>ステータス</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {broadcasts.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Send className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{b.title}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {b.sent_at
                        ? new Date(b.sent_at).toLocaleString("ja-JP")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {b.target_type === "all"
                        ? "全友だち"
                        : b.target_type === "segment"
                          ? "セグメント"
                          : b.target_type}
                    </TableCell>
                    <TableCell className="text-sm">
                      {b.delivered_count > 0
                        ? b.delivered_count.toLocaleString()
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
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
