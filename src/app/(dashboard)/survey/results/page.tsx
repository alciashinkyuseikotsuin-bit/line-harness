"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Send, Users, ArrowRight } from "lucide-react";
import Link from "next/link";

const surveyResults = [
  {
    id: "sv1",
    title: "初回カウンセリングアンケート",
    totalResponses: 342,
    questions: [
      {
        id: "q1",
        text: "どのメニューに興味がありますか？",
        choices: [
          {
            text: "カット",
            tag: "カット希望",
            count: 145,
            percent: 42.4,
            broadcastStatus: "sent",
            broadcastTitle: "カットメニュー限定クーポン",
          },
          {
            text: "カラー",
            tag: "カラー希望",
            count: 112,
            percent: 32.7,
            broadcastStatus: "sent",
            broadcastTitle: "春のカラーキャンペーン",
          },
          {
            text: "トリートメント",
            tag: "トリートメント希望",
            count: 85,
            percent: 24.9,
            broadcastStatus: "scheduled",
            broadcastTitle: "トリートメント新メニュー案内",
          },
        ],
      },
      {
        id: "q2",
        text: "ご予算はどのくらいですか？",
        choices: [
          {
            text: "5,000円以下",
            tag: "予算:5千円以下",
            count: 98,
            percent: 28.7,
            broadcastStatus: "sent",
            broadcastTitle: "お手頃メニューのご案内",
          },
          {
            text: "5,000〜10,000円",
            tag: "予算:5千〜1万",
            count: 156,
            percent: 45.6,
            broadcastStatus: "sent",
            broadcastTitle: "人気スタンダードメニュー",
          },
          {
            text: "10,000円以上",
            tag: "予算:1万円以上",
            count: 88,
            percent: 25.7,
            broadcastStatus: "none",
            broadcastTitle: "",
          },
        ],
      },
    ],
  },
  {
    id: "sv2",
    title: "来店頻度アンケート",
    totalResponses: 218,
    questions: [
      {
        id: "q1",
        text: "どのくらいの頻度で美容院に通いますか？",
        choices: [
          {
            text: "月1回",
            tag: "来店:月1",
            count: 89,
            percent: 40.8,
            broadcastStatus: "sent",
            broadcastTitle: "月1回リピーター様限定特典",
          },
          {
            text: "2ヶ月に1回",
            tag: "来店:2ヶ月",
            count: 76,
            percent: 34.9,
            broadcastStatus: "scheduled",
            broadcastTitle: "次回予約リマインド",
          },
          {
            text: "3ヶ月以上",
            tag: "来店:3ヶ月+",
            count: 53,
            percent: 24.3,
            broadcastStatus: "none",
            broadcastTitle: "",
          },
        ],
      },
    ],
  },
];

function BroadcastStatusBadge({ status }: { status: string }) {
  if (status === "sent") {
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-700">
        配信済み
      </Badge>
    );
  }
  if (status === "scheduled") {
    return (
      <Badge variant="secondary" className="bg-blue-100 text-blue-700">
        予約中
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-gray-100 text-gray-500">
      未設定
    </Badge>
  );
}

export default function SurveyResultsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">回答結果</h1>
      </div>

      {surveyResults.map((survey) => (
        <Card key={survey.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{survey.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  総回答数: {survey.totalResponses.toLocaleString()}件
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {survey.questions.map((q, qi) => (
              <div key={q.id} className="space-y-3">
                {qi > 0 && <Separator />}
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Q{qi + 1}</Badge>
                  <span className="text-sm font-medium">{q.text}</span>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>選択肢</TableHead>
                      <TableHead>回答数</TableHead>
                      <TableHead>割合</TableHead>
                      <TableHead>セグメントタグ</TableHead>
                      <TableHead></TableHead>
                      <TableHead>配信状況</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.choices.map((c) => (
                      <TableRow key={c.text}>
                        <TableCell className="font-medium">{c.text}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {c.count}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#06C755]"
                                style={{ width: `${c.percent}%` }}
                              />
                            </div>
                            <span className="text-sm">{c.percent}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {c.tag}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <BroadcastStatusBadge status={c.broadcastStatus} />
                            {c.broadcastTitle && (
                              <div className="text-xs text-muted-foreground">
                                {c.broadcastTitle}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.broadcastStatus === "none" && (
                            <Link href="/broadcast">
                              <Button size="sm" variant="outline">
                                <Send className="h-3 w-3 mr-1" />
                                配信作成
                              </Button>
                            </Link>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
