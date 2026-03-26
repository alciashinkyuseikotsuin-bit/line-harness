"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Send } from "lucide-react";

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

  useEffect(() => {
    fetch("/api/broadcast")
      .then((r) => r.json())
      .then((d) => setBroadcasts(d.broadcasts || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const sentBroadcasts = broadcasts.filter((b) => b.status === "sent");
  const totalDelivered = sentBroadcasts.reduce(
    (s, b) => s + (b.delivered_count || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">一斉配信</h1>
        <Button className="bg-[#06C755] hover:bg-[#05b34c]">
          <Plus className="h-4 w-4 mr-2" />
          新規配信
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              配信数
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
                  <TableRow
                    key={b.id}
                    className="cursor-pointer hover:bg-muted/50"
                  >
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
