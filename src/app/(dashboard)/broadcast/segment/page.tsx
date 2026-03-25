"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Tag } from "lucide-react";

const segments = [
  {
    id: 1,
    name: "VIPユーザー",
    description: "来店3回以上 & 単価1万円以上",
    count: 186,
    lastUsed: "2026-03-20",
    tags: ["VIP"],
  },
  {
    id: 2,
    name: "新規ユーザー（30日以内）",
    description: "友だち追加から30日以内",
    count: 94,
    lastUsed: "2026-03-18",
    tags: ["新規"],
  },
  {
    id: 3,
    name: "休眠ユーザー",
    description: "60日以上アクティビティなし",
    count: 312,
    lastUsed: "2026-03-10",
    tags: ["休眠"],
  },
  {
    id: 4,
    name: "カットメニュー利用者",
    description: "カット関連メニューの予約経験あり",
    count: 567,
    lastUsed: "2026-03-15",
    tags: ["カット"],
  },
];

export default function SegmentPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">セグメント配信</h1>
        <Button className="bg-[#06C755] hover:bg-[#05b34c]">
          <Plus className="h-4 w-4 mr-2" />
          セグメント作成
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {segments.map((seg) => (
          <Card key={seg.id} className="cursor-pointer hover:border-[#06C755]/50 transition-colors">
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-base">{seg.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {seg.description}
                </p>
              </div>
              <div className="flex gap-1">
                {seg.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    <Tag className="h-3 w-3 mr-1" />
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {seg.count.toLocaleString()} 人
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    最終利用: {seg.lastUsed}
                  </span>
                  <Button size="sm" variant="outline">
                    配信する
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
