"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, ClipboardList, Send, BarChart3 } from "lucide-react";

type Choice = {
  id: string;
  text: string;
  tag: string;
  broadcastMessage: string | null;
  count: number;
  percent: number;
};

type Question = {
  id: string;
  text: string;
  totalResponses: number;
  choices: Choice[];
};

type SurveySummary = {
  id: string;
  title: string;
  sentCount: number;
  uniqueRespondents: number;
  responseRate: number; // %
  totalResponses: number;
  status: string;
  surveyType?: "survey" | "diagnosis";
  diagnosisCompletedCount?: number;
};

type DiagnosisDistributionItem = {
  typeKey: string;
  title: string;
  addTag: string | null;
  count: number;
  percent: number;
};

type DetailedResult = {
  survey: SurveySummary;
  questions: Question[];
  diagnosisDistribution?: DiagnosisDistributionItem[];
};

export default function SurveyResultsPage() {
  const [surveyList, setSurveyList] = useState<
    {
      id: string;
      title: string;
      status: string;
      sent_count: number;
      unique_respondents: number;
      response_count: number;
      response_rate: number;
    }[]
  >([]);
  const [details, setDetails] = useState<DetailedResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const listRes = await fetch("/api/surveys");
        const listData = await listRes.json();
        const list = listData.surveys || [];
        setSurveyList(list);

        // 各サーベイの詳細を並列取得
        const detailed = await Promise.all(
          list.map(async (sv: { id: string }) => {
            const r = await fetch(`/api/surveys/${sv.id}/results`);
            return r.json();
          })
        );
        setDetails(detailed.filter((d) => d.survey));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalSent = surveyList.reduce((s, sv) => s + (sv.sent_count || 0), 0);
  const totalRespondents = surveyList.reduce(
    (s, sv) => s + (sv.unique_respondents || 0),
    0
  );
  const overallRate =
    totalSent > 0 ? Math.round((totalRespondents / totalSent) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">回答結果</h1>
        <p className="text-sm text-muted-foreground mt-1">
          各アンケートの送信数・回答数・回答率を確認できます。
        </p>
      </div>

      {/* 全体サマリ */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              アンケート数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-muted-foreground" />
              {surveyList.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              総送信数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Send className="h-5 w-5 text-muted-foreground" />
              {totalSent.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              総回答者数（実人数）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              {totalRespondents.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              全体回答率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2 text-[#06C755]">
              <BarChart3 className="h-5 w-5" />
              {overallRate}%
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          読み込み中...
        </p>
      ) : details.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              まだアンケート結果がありません。アンケートを作成して配信してください。
            </p>
          </CardContent>
        </Card>
      ) : (
        details.map((d) => (
          <Card key={d.survey.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{d.survey.title}</CardTitle>
                    {d.survey.surveyType === "diagnosis" && (
                      <Badge className="text-xs bg-purple-100 text-purple-700">
                        診断コンテンツ
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    送信 {d.survey.sentCount.toLocaleString()}人 ／ 回答者{" "}
                    {d.survey.uniqueRespondents.toLocaleString()}人
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-[#06C755]">
                    {d.survey.responseRate}%
                  </div>
                  <div className="text-xs text-muted-foreground">回答率</div>
                </div>
              </div>
              {/* 回答率バー */}
              <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#06C755] transition-all"
                  style={{ width: `${Math.min(d.survey.responseRate, 100)}%` }}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {d.survey.surveyType === "diagnosis" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">🎯 診断結果分布</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      診断完了: {(d.survey.diagnosisCompletedCount || 0).toLocaleString()}人
                    </span>
                  </div>
                  {!d.diagnosisDistribution || d.diagnosisDistribution.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      診断タイプが未設定、またはまだ診断完了者がいません
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>タイプ</TableHead>
                          <TableHead className="w-[100px]">人数</TableHead>
                          <TableHead className="w-[200px]">割合</TableHead>
                          <TableHead>付与タグ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {d.diagnosisDistribution.map((t) => (
                          <TableRow key={t.typeKey}>
                            <TableCell className="font-medium">{t.title}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Users className="h-3 w-3 text-muted-foreground" />
                                {t.count}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-purple-500"
                                    style={{ width: `${t.percent}%` }}
                                  />
                                </div>
                                <span className="text-sm tabular-nums w-12">
                                  {t.percent}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {t.addTag ? (
                                <Badge variant="outline" className="text-xs">
                                  {t.addTag}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <Separator />
                </div>
              )}
              {d.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  質問がありません
                </p>
              ) : (
                d.questions.map((q, qi) => (
                  <div key={q.id} className="space-y-3">
                    {qi > 0 && <Separator />}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary">Q{qi + 1}</Badge>
                      <span className="text-sm font-medium">{q.text}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        この質問の回答: {q.totalResponses}件
                      </span>
                    </div>

                    {q.choices.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        選択肢がありません
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>選択肢</TableHead>
                            <TableHead className="w-[100px]">回答数</TableHead>
                            <TableHead className="w-[200px]">割合</TableHead>
                            <TableHead>付与タグ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {q.choices.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-medium">
                                {c.text}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <Users className="h-3 w-3 text-muted-foreground" />
                                  {c.count}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-[#06C755]"
                                      style={{ width: `${c.percent}%` }}
                                    />
                                  </div>
                                  <span className="text-sm tabular-nums w-12">
                                    {c.percent}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {c.tag ? (
                                  <Badge variant="outline" className="text-xs">
                                    {c.tag}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
