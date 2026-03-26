"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";

type Friend = {
  id: string;
  line_user_id: string;
  display_name: string;
  picture_url: string | null;
  tags: string[];
  is_blocked: boolean;
  joined_at: string;
  last_active_at: string;
};

export default function UsersPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  function loadFriends() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    fetch(`/api/friends?${params}`)
      .then((r) => r.json())
      .then((d) => setFriends(d.friends || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  // 初回: LINE APIから同期 → 友だち一覧を取得
  useEffect(() => {
    fetch("/api/friends/sync", { method: "POST" })
      .catch(() => {})
      .finally(() => loadFriends());
  }, []);

  // 検索時: 友だち一覧を再取得
  useEffect(() => {
    if (!loading) loadFriends();
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">友だち一覧</h1>
        <span className="text-sm text-muted-foreground">
          全 {friends.length} 人
        </span>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="名前で検索..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              LINEから友だち情報を取得中...
            </p>
          ) : friends.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              友だちがいません。LINE公式アカウントを友だち追加してください。
            </p>
          ) : (
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
                {friends.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {user.picture_url && (
                            <AvatarImage src={user.picture_url} />
                          )}
                          <AvatarFallback className="text-xs bg-[#06C755] text-white">
                            {user.display_name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">
                            {user.display_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {user.line_user_id.slice(0, 10)}...
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.joined_at
                        ? new Date(user.joined_at).toLocaleDateString("ja-JP")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.last_active_at
                        ? new Date(user.last_active_at).toLocaleDateString(
                            "ja-JP"
                          )
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {(user.tags || []).map((tag) => (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
