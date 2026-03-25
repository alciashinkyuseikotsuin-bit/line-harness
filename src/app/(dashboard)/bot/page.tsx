"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Copy, ExternalLink } from "lucide-react";

export default function BotSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bot設定</h1>
        <Badge variant="secondary" className="bg-green-100 text-green-700">
          接続中
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" />
              基本情報
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Bot名</label>
              <Input defaultValue="サロン公式アカウント" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">ステータスメッセージ</label>
              <Input defaultValue="ご予約・お問合せはこちらから" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">説明文</label>
              <Textarea
                defaultValue="美容サロンの公式LINEアカウントです。最新情報やお得なクーポンをお届けします。"
                rows={3}
              />
            </div>
            <Button className="bg-[#06C755] hover:bg-[#05b34c]">保存</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">接続情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Channel ID</label>
              <div className="flex gap-2">
                <Input defaultValue="1234567890" readOnly className="font-mono text-sm" />
                <Button variant="outline" size="icon">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Channel Secret</label>
              <div className="flex gap-2">
                <Input defaultValue="••••••••••••••••" type="password" readOnly className="font-mono text-sm" />
                <Button variant="outline" size="icon">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Webhook URL</label>
              <div className="flex gap-2">
                <Input
                  defaultValue="https://example.com/api/webhook"
                  readOnly
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="icon">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button variant="outline" className="w-full">
              <ExternalLink className="h-4 w-4 mr-2" />
              LINE Developers で開く
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">応答設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="text-sm font-medium">あいさつメッセージ</div>
                <div className="text-xs text-muted-foreground">
                  友だち追加時に自動送信
                </div>
                <Badge className="bg-green-100 text-green-700">ON</Badge>
              </div>
              <div className="rounded-lg border p-4 space-y-2">
                <div className="text-sm font-medium">応答メッセージ</div>
                <div className="text-xs text-muted-foreground">
                  キーワードに自動応答
                </div>
                <Badge className="bg-green-100 text-green-700">ON</Badge>
              </div>
              <div className="rounded-lg border p-4 space-y-2">
                <div className="text-sm font-medium">Webhook</div>
                <div className="text-xs text-muted-foreground">
                  外部サーバーに通知
                </div>
                <Badge className="bg-green-100 text-green-700">ON</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
