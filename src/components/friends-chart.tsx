"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

const chartConfig = {
  friends: {
    label: "友だち数",
    color: "#06C755",
  },
} satisfies ChartConfig;

export function FriendsChart() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setCount(d.friendsCount || 0))
      .catch(console.error);
  }, []);

  // Generate simple chart data showing current state
  const data =
    count !== null
      ? [{ month: "現在", friends: count }]
      : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">友だち数</CardTitle>
      </CardHeader>
      <CardContent>
        {count === null ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            読み込み中...
          </p>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="text-5xl font-bold text-[#06C755]">
              {count.toLocaleString()}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              現在の友だち数
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
