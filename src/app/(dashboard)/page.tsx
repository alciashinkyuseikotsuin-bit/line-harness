import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Send, MessageSquare, TrendingUp } from "lucide-react";
import { RecentBroadcasts } from "@/components/recent-broadcasts";
import { FriendsChart } from "@/components/friends-chart";

const stats = [
  {
    title: "友だち数",
    value: "1,248",
    change: "+12.5%",
    icon: Users,
  },
  {
    title: "今月の配信数",
    value: "24",
    change: "+4",
    icon: Send,
  },
  {
    title: "メッセージ消費",
    value: "8,432",
    change: "残り 11,568",
    icon: MessageSquare,
  },
  {
    title: "開封率",
    value: "68.4%",
    change: "+2.1%",
    icon: TrendingUp,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.change}</p>
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
