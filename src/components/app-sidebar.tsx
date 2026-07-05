"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ClipboardList,
  Gem,
  LayoutDashboard,
  Link2,
  MessageCircleReply,
  MessageSquare,
  PieChart,
  Send,
  Settings,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

const navMain = [
  {
    label: "ダッシュボード",
    href: "/",
    icon: LayoutDashboard,
  },
];

const navBot = [
  {
    label: "Bot設定",
    href: "/bot",
    icon: Bot,
  },
  {
    label: "リッチメニュー",
    href: "/bot/richmenu",
    icon: MessageSquare,
  },
  {
    label: "顧客管理（カルテ）",
    href: "/bot/users",
    icon: Users,
  },
  {
    label: "タグ管理",
    href: "/tags",
    icon: Tag,
  },
];

const navSurvey = [
  {
    label: "アンケート一覧",
    href: "/survey",
    icon: ClipboardList,
  },
  {
    label: "回答結果",
    href: "/survey/results",
    icon: PieChart,
  },
];

const navEngage = [
  {
    label: "キーワード自動応答",
    href: "/engage/replies",
    icon: MessageCircleReply,
  },
  {
    label: "おみくじ",
    href: "/engage/omikuji",
    icon: Sparkles,
  },
  {
    label: "ポイント・特典",
    href: "/engage/points",
    icon: Gem,
  },
  {
    label: "リンク計測",
    href: "/engage/links",
    icon: Link2,
  },
];

const navBroadcast = [
  {
    label: "一斉配信",
    href: "/broadcast",
    icon: Send,
  },
  {
    label: "セグメント配信",
    href: "/broadcast/segment",
    icon: Users,
  },
  {
    label: "ステップ配信",
    href: "/broadcast/step",
    icon: MessageSquare,
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#06C755] text-white font-bold text-lg">
            H
          </div>
          <div>
            <div className="font-semibold text-sm">LINE Harness</div>
            <div className="text-xs text-muted-foreground">管理画面</div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navMain.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Bot管理</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navBot.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>アンケート</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navSurvey.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>エンゲージ</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navEngage.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>配信管理</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navBroadcast.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/settings" />}
              isActive={pathname === "/settings"}
            >
              <Settings className="h-4 w-4" />
              <span>設定</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
