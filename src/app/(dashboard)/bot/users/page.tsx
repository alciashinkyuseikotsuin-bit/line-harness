"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";

const users = [
  {
    id: "U001",
    name: "田中 花子",
    joinedAt: "2025-11-03",
    lastActive: "2026-03-25",
    tags: ["VIP", "リピーター"],
    blocked: false,
  },
  {
    id: "U002",
    name: "佐藤 太郎",
    joinedAt: "2025-12-15",
    lastActive: "2026-03-24",
    tags: ["新規"],
    blocked: false,
  },
  {
    id: "U003",
    name: "山田 美咲",
    joinedAt: "2026-01-08",
    lastActive: "2026-03-20",
    tags: ["リピーター"],
    blocked: false,
  },
  {
    id: "U004",
    name: "鈴木 一郎",
    joinedAt: "2026-02-20",
    lastActive: "2026-03-10",
    tags: [],
    blocked: false,
  },
  {
    id: "U005",
    name: "高橋 さくら",
    joinedAt: "2026-03-01",
    lastActive: "2026-03-26",
    tags: ["新規", "VIP"],
    blocked: false,
  },
];

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">友だち一覧</h1>
        <span className="text-sm text-muted-foreground">
          全 1,248 人
        </span>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="名前・タグで検索..." className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ユーザー</TableHead>
                <TableHead>友だち追加日</TableHead>
                <TableHead>最終アクティブ</TableHead>
                <TableHead>タグ</TableHead>
                <TableHead>ステータス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-[#06C755] text-white">
                          {user.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium">{user.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {user.id}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{user.joinedAt}</TableCell>
                  <TableCell className="text-sm">{user.lastActive}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {user.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="bg-green-100 text-green-700"
                    >
                      アクティブ
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
