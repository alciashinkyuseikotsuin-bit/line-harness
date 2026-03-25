"use client";

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

const broadcasts = [
  {
    id: 1,
    title: "3月キャンペーン告知",
    date: "2026-03-25 10:00",
    target: "全友だち",
    delivered: 1248,
    opens: "72.1%",
    clicks: "18.3%",
    status: "sent",
  },
  {
    id: 2,
    title: "新メニュー紹介",
    date: "2026-03-20 12:00",
    target: "全友だち",
    delivered: 1230,
    opens: "65.8%",
    clicks: "12.7%",
    status: "sent",
  },
  {
    id: 3,
    title: "リマインド配信",
    date: "2026-03-15 18:00",
    target: "全友だち",
    delivered: 1215,
    opens: "58.2%",
    clicks: "9.4%",
    status: "sent",
  },
  {
    id: 4,
    title: "4月予約受付開始",
    date: "2026-03-28 10:00",
    target: "全友だち",
    delivered: 0,
    opens: "-",
    clicks: "-",
    status: "scheduled",
  },
  {
    id: 5,
    title: "春の新生活応援",
    date: "2026-04-01 09:00",
    target: "全友だち",
    delivered: 0,
    opens: "-",
    clicks: "-",
    status: "draft",
  },
];

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
    <Badge variant="secondary" className={styles[status]}>
      {labels[status]}
    </Badge>
  );
}

export default function BroadcastPage() {
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
              今月の配信数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              平均開封率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">65.4%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              平均クリック率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">13.5%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>タイトル</TableHead>
                <TableHead>配信日時</TableHead>
                <TableHead>対象</TableHead>
                <TableHead>配信数</TableHead>
                <TableHead>開封率</TableHead>
                <TableHead>クリック率</TableHead>
                <TableHead>ステータス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((b) => (
                <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Send className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{b.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{b.date}</TableCell>
                  <TableCell className="text-sm">{b.target}</TableCell>
                  <TableCell className="text-sm">
                    {b.delivered > 0 ? b.delivered.toLocaleString() : "-"}
                  </TableCell>
                  <TableCell className="text-sm">{b.opens}</TableCell>
                  <TableCell className="text-sm">{b.clicks}</TableCell>
                  <TableCell>
                    <StatusBadge status={b.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
