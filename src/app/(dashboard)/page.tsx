"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  Send,
  MessageSquare,
  ClipboardList,
  Flame,
  Activity,
  Moon,
  Gem,
  RefreshCw,
} from "lucide-react";
import { RecentBroadcasts } from "@/components/recent-broadcasts";
import { FriendsChart } from "@/components/friends-chart";

type Stats = {
  friendsCount: number;
  broadcastCount: number;
  totalMessages: number;
  surveyResponses: number;
  bands?: Record<string, number>;
  activeToday?: number;
  inboundToday?: number;
  pointsTotal?: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recalcing, setRecalcing] = useState(false);

  const loadStats = () => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleRecalc = async () => {
    setRecalcing(true);
    try {
      await fetch("/api/stats/recalc", { method: "POST" });
      loadStats();
    } catch (e) {
      console.error(e);
    } finally {
      setRecalcing(false);
    }
  };

  const cards = [
    {
      title: "友だち数",
      value: stats?.friendsCount?.toLocaleString() ?? "-",
      icon: Users,
    },
    {
      title: "今月の配信数",
      value: stats?.broadcastCount?.toLocaleString() ?? "-",
      icon: Send,
    },
    {
      title: "今日のアクティブ",
      value: stats?.activeToday?.toLocaleString() ?? "-",
      icon: Activity,
    },
    {
      title: "アンケート回答数",
      value: stats?.surveyResponses?.toLocaleString() ?? "-",
      icon: ClipboardList,
    },
  ];

  const bandCards = [
    {
      title: "ホット（70+）",
      value: stats?.bands?.["ホット"] ?? "-",
      icon: Flame,
      color: "text-red-500",
    },
    {
      title: "アクティブ（40-69）",
      value: stats?.bands?.["アクティブ"] ?? "-",
      icon: Activity,
      color: "text-emerald-500",
    },
    {
      title: "ライト（15-39）",
      value: stats?.bands?.["ライト"] ?? "-",
      icon: MessageSquare,
      color: "text-amber-500",
    },
    {
      title: "休眠（〜14）",
      value: stats?.bands?.["休眠"] ?? "-",
      icon: Moon,
      color: "text-slate-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecalc}
          disabled={recalcing}
        >
          <RefreshCw
            className={`h-4 w-4 mr-1 ${recalcing ? "animate-spin" : ""}`}
          />
          {recalcing ? "スコア再計算中…" : "スコア再計算"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Flame className="h-4 w-4" />
          エンゲージメント（温度感）
          <span className="text-xs font-normal">
            ／ 発行ポイント合計:{" "}
            <Gem className="inline h-3 w-3" />{" "}
            {stats?.pointsTotal?.toLocaleString() ?? "-"}pt ／ 今日の受信:{" "}
            {stats?.inboundToday?.toLocaleString() ?? "-"}件
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bandCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground">人</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <FriendsChart />
        <RecentBroadcasts />
      </div>
    </div>
  );
}
