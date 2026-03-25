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
import { Plus, ClipboardList, Send } from "lucide-react";
import Link from "next/link";

const surveys = [
  {
    id: "sv1",
    title: "初回カウンセリングアンケート",
    questions: 5,
    responses: 342,
    status: "active",
    createdAt: "2026-02-10",
    segments: [
      { answer: "カット希望", tag: "カット希望", count: 145 },
      { answer: "カラー希望", tag: "カラー希望", count: 112 },
      { answer: "トリートメント希望", tag: "トリートメント希望", count: 85 },
    ],
  },
  {
    id: "sv2",
    title: "来店頻度アンケート",
    questions: 3,
    responses: 218,
    status: "active",
    createdAt: "2026-03-01",
    segments: [
      { answer: "月1回", tag: "来店:月1", count: 89 },
      { answer: "2ヶ月に1回", tag: "来店:2ヶ月", count: 76 },
      { answer: "3ヶ月以上", tag: "来店:3ヶ月+", count: 53 },
    ],
  },
  {
    id: "sv3",
    title: "春キャンペーン興味調査",
    questions: 4,
    responses: 0,
    status: "draft",
    createdAt: "2026-03-25",
    segments: [],
  },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-700">
        配信中
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-gray-100 text-gray-500">
      下書き
    </Badge>
  );
}

export default function SurveyListPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">アンケート一覧</h1>
        <Link href="/survey/create">
          <Button className="bg-[#06C755] hover:bg-[#05b34c]">
            <Plus className="h-4 w-4 mr-2" />
            新規作成
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              アンケート数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{surveys.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              総回答数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {surveys.reduce((s, sv) => s + sv.responses, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              生成セグメント数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {surveys.reduce((s, sv) => s + sv.segments.length, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>アンケート名</TableHead>
                <TableHead>質問数</TableHead>
                <TableHead>回答数</TableHead>
                <TableHead>セグメント</TableHead>
                <TableHead>作成日</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {surveys.map((sv) => (
                <TableRow key={sv.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{sv.title}</span>
                    </div>
                  </TableCell>
                  <TableCell>{sv.questions}問</TableCell>
                  <TableCell>{sv.responses.toLocaleString()}件</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {sv.segments.length > 0 ? (
                        sv.segments.map((seg) => (
                          <Badge
                            key={seg.tag}
                            variant="outline"
                            className="text-xs"
                          >
                            {seg.tag} ({seg.count})
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          未設定
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{sv.createdAt}</TableCell>
                  <TableCell>
                    <StatusBadge status={sv.status} />
                  </TableCell>
                  <TableCell>
                    {sv.status === "active" && sv.segments.length > 0 && (
                      <Link href="/broadcast/segment">
                        <Button size="sm" variant="outline">
                          <Send className="h-3 w-3 mr-1" />
                          配信
                        </Button>
                      </Link>
                    )}
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
