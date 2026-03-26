"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Send, X, Loader2 } from "lucide-react";

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
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [friendCount, setFriendCount] = useState(0);

  useEffect(() => {
    fetch("/api/broadcast")
      .then((r) => r.json())
      .then((d) => setBroadcasts(d.broadcasts || []))
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch("/api/friends")
      .then((r) => r.json())
      .then((d) => setFriendCount((d.friends || []).length));
  }, []);

  async function sendBroadcast() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "一斉配信",
          message,
          targetType: "all",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`配信完了: ${data.deliveredCount}人に送信しました`);
        setShowCreate(false);
        setShowConfirm(false);
        setTitle("");
        setMessage("");
        // 履歴をリロード
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
                  placeholder="全友だちに配信するメッセージを入力..."
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                配信対象: 全友だち（{friendCount}人）
              </div>
              <Button
                className="w-full bg-[#06C755] hover:bg-[#05b34c]"
                disabled={!message.trim()}
                onClick={() => setShowConfirm(true)}
              >
                <Send className="h-4 w-4 mr-2" />
                配信内容を確認
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 確認ダイアログ */}
      {showConfirm && (
        <Card className="border-[#06C755] border-2">
          <CardContent className="pt-6">
            <h3 className="font-bold text-lg mb-4">配信内容の最終確認</h3>
            <div className="space-y-3 mb-6">
              <div>
                <span className="text-sm text-muted-foreground">対象:</span>
                <span className="ml-2 font-medium">全友だち（{friendCount}人）</span>
              </div>
              {title && (
                <div>
                  <span className="text-sm text-muted-foreground">タイトル:</span>
                  <span className="ml-2">{title}</span>
                </div>
              )}
              <div>
                <span className="text-sm text-muted-foreground">メッセージ:</span>
                <div className="mt-1 rounded-md bg-muted p-4 text-sm whitespace-pre-wrap">
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
                戻って編集
              </Button>
              <Button
                className="flex-1 bg-[#06C755] hover:bg-[#05b34c]"
                disabled={sending}
                onClick={sendBroadcast}
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
