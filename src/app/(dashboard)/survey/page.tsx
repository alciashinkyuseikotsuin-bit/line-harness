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
import { Plus, ClipboardList, Send } from "lucide-react";
import Link from "next/link";

type Choice = {
  id: string;
  choice_text: string;
  tag: string;
};

type Question = {
  id: string;
  question_text: string;
  survey_choices: Choice[];
};

type Survey = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  survey_questions: Question[];
  response_count: number;
};

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
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/surveys")
      .then((r) => r.json())
      .then((d) => setSurveys(d.surveys || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalResponses = surveys.reduce(
    (s, sv) => s + (sv.response_count || 0),
    0
  );
  const totalSegments = surveys.reduce(
    (s, sv) =>
      s +
      sv.survey_questions.reduce(
        (qs, q) => qs + q.survey_choices.filter((c) => c.tag).length,
        0
      ),
    0
  );

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
            <div className="text-2xl font-bold">{totalResponses}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              生成セグメント数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSegments}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              読み込み中...
            </p>
          ) : surveys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              アンケートがありません。新規作成してください。
            </p>
          ) : (
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
                  <TableRow
                    key={sv.id}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{sv.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>{sv.survey_questions.length}問</TableCell>
                    <TableCell>
                      {(sv.response_count || 0).toLocaleString()}件
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {sv.survey_questions.flatMap((q) =>
                          q.survey_choices
                            .filter((c) => c.tag)
                            .map((c) => (
                              <Badge
                                key={c.id}
                                variant="outline"
                                className="text-xs"
                              >
                                {c.tag}
                              </Badge>
                            ))
                        )}
                        {sv.survey_questions.every(
                          (q) => q.survey_choices.every((c) => !c.tag)
                        ) && (
                          <span className="text-xs text-muted-foreground">
                            未設定
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(sv.created_at).toLocaleDateString("ja-JP")}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={sv.status} />
                    </TableCell>
                    <TableCell>
                      {sv.status === "active" && (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
