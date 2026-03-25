"use client";

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

const data = [
  { month: "10月", friends: 980 },
  { month: "11月", friends: 1020 },
  { month: "12月", friends: 1085 },
  { month: "1月", friends: 1130 },
  { month: "2月", friends: 1190 },
  { month: "3月", friends: 1248 },
];

const chartConfig = {
  friends: {
    label: "友だち数",
    color: "#06C755",
  },
} satisfies ChartConfig;

export function FriendsChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">友だち数推移</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="friends"
              stroke="#06C755"
              fill="#06C755"
              fillOpacity={0.15}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
