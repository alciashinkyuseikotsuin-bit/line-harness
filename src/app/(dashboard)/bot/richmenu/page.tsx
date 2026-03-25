"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, MoreHorizontal } from "lucide-react";

const richMenus = [
  {
    id: 1,
    name: "メインメニュー",
    status: "active",
    areas: 6,
    linkedUsers: 1248,
  },
  {
    id: 2,
    name: "キャンペーンメニュー",
    status: "inactive",
    areas: 4,
    linkedUsers: 0,
  },
  {
    id: 3,
    name: "予約導線メニュー",
    status: "inactive",
    areas: 3,
    linkedUsers: 0,
  },
];

export default function RichMenuPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">リッチメニュー</h1>
        <Button className="bg-[#06C755] hover:bg-[#05b34c]">
          <Plus className="h-4 w-4 mr-2" />
          新規作成
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {richMenus.map((menu) => (
          <Card key={menu.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{menu.name}</CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="aspect-[2/1] rounded-md bg-muted flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed">
                {menu.areas}エリア
              </div>
              <div className="flex items-center justify-between">
                <Badge
                  variant="secondary"
                  className={
                    menu.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }
                >
                  {menu.status === "active" ? "表示中" : "非表示"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {menu.linkedUsers.toLocaleString()} 人にリンク
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
