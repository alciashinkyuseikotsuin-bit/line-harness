"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Send, MessageSquare, ClipboardList } from "lucide-react";
import { RecentBroadcasts } from "@/components/recent-broadcasts";
import { FriendsChart } from "@/components/friends-chart";

type Stats = {
  friendsCount: number;
  broadcastCount: number;
  totalMessages: number;
  surveyResponses: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

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
      title: "総配信メッセージ",
      value: stats?.totalMessages?.toLocaleString() ?? "-",
      icon: MessageSquare,
    },
    {
      title: "アンケート回答数",
      value: stats?.surveyResponses?.toLocaleString() ?? "-",
      icon: ClipboardList,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

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

      <div className="grid gap-6 lg:grid-cols-2">
        <FriendsChart />
        <RecentBroadcasts />
      </div>
    </div>
  );
}
