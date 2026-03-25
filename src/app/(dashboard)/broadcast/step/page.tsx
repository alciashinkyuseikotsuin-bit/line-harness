"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowRight, Clock, MessageSquare } from "lucide-react";

const stepFlows = [
  {
    id: 1,
    name: "友だち追加 ウェルカムフロー",
    trigger: "友だち追加時",
    status: "active",
    enrolled: 1248,
    steps: [
      { delay: "即時", message: "ウェルカムメッセージ" },
      { delay: "1日後", message: "サービス紹介" },
      { delay: "3日後", message: "初回クーポン" },
      { delay: "7日後", message: "レビュー依頼" },
    ],
  },
  {
    id: 2,
    name: "予約リマインドフロー",
    trigger: "予約確定時",
    status: "active",
    enrolled: 432,
    steps: [
      { delay: "即時", message: "予約確認" },
      { delay: "前日", message: "リマインド" },
      { delay: "翌日", message: "お礼＆レビュー依頼" },
    ],
  },
  {
    id: 3,
    name: "休眠復帰フロー",
    trigger: "60日未アクティブ",
    status: "paused",
    enrolled: 89,
    steps: [
      { delay: "即時", message: "お久しぶりメッセージ" },
      { delay: "3日後", message: "特別クーポン" },
      { delay: "7日後", message: "最終リマインド" },
    ],
  },
];

export default function StepPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ステップ配信</h1>
        <Button className="bg-[#06C755] hover:bg-[#05b34c]">
          <Plus className="h-4 w-4 mr-2" />
          フロー作成
        </Button>
      </div>

      <div className="space-y-4">
        {stepFlows.map((flow) => (
          <Card key={flow.id} className="cursor-pointer hover:border-[#06C755]/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-base">{flow.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  トリガー: {flow.trigger} ・ 登録: {flow.enrolled.toLocaleString()}人
                </p>
              </div>
              <Badge
                variant="secondary"
                className={
                  flow.status === "active"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }
              >
                {flow.status === "active" ? "稼働中" : "一時停止"}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {flow.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 shrink-0">
                    <div className="rounded-lg border bg-muted/50 p-3 min-w-[140px]">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Clock className="h-3 w-3" />
                        {step.delay}
                      </div>
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <MessageSquare className="h-3 w-3" />
                        {step.message}
                      </div>
                    </div>
                    {i < flow.steps.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
