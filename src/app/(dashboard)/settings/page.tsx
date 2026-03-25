"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">設定</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LINE API設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Channel Access Token</label>
            <Input
              type="password"
              defaultValue="••••••••••••••••••••"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Channel Secret</label>
            <Input
              type="password"
              defaultValue="••••••••••••"
              className="font-mono text-sm"
            />
          </div>
          <Button className="bg-[#06C755] hover:bg-[#05b34c]">保存</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">通知設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">通知先メールアドレス</label>
            <Input
              type="email"
              placeholder="admin@example.com"
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Slack Webhook URL</label>
            <Input
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              className="font-mono text-sm"
            />
          </div>
          <Button className="bg-[#06C755] hover:bg-[#05b34c]">保存</Button>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            危険な操作
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            この操作は取り消せません。すべての配信データとユーザーデータが削除されます。
          </p>
          <Button variant="destructive">全データ削除</Button>
        </CardContent>
      </Card>
    </div>
  );
}
