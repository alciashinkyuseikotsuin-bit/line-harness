"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Loader2,
  Save,
  Sparkles,
  Send,
  Plus,
  X,
  Tag as TagIcon,
  ClipboardList,
  Coins,
  Clock,
} from "lucide-react";
import { STAGES, stageColor } from "@/lib/stages";
import { scoreBand } from "@/lib/engagement";

type Friend = {
  id: string;
  line_user_id: string;
  display_name: string;
  picture_url: string | null;
  status_message: string | null;
  tags: string[];
  is_blocked: boolean;
  joined_at: string;
  last_active_at: string;
  notes: string | null;
  stage: string;
  points: number;
  engagement_score: number;
  score_updated_at: string | null;
  ai_summary: string | null;
  ai_summary_at: string | null;
};

type MessageRow = {
  id: string;
  direction: "in" | "out";
  message_type: string;
  content: string | null;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type EventRow = {
  id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type SurveyResponseRow = {
  id: string;
  responded_at: string;
  surveys: { title: string } | null;
  survey_questions: { question_text: string } | null;
  survey_choices: { choice_text: string } | null;
};

type PointTransactionRow = {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
};

const EVENT_LABELS: Record<string, string> = {
  follow: "友だち追加",
  unfollow: "ブロック",
  message: "メッセージ受信",
  survey_answer: "アンケート回答",
  survey_complete: "アンケート回答完了",
  diagnosis_complete: "診断完了",
  link_click: "リンククリック",
  keyword_reply: "キーワード自動応答",
  omikuji: "おみくじ",
  points: "ポイント変動",
  reward: "特典獲得",
  stage_change: "ステージ変更",
  manual_message: "手動メッセージ送信",
  ai_analyzed: "AI分析実行",
};

function scoreBandColor(band: string): string {
  switch (band) {
    case "ホット":
      return "bg-red-100 text-red-700";
    case "アクティブ":
      return "bg-green-100 text-green-700";
    case "ライト":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] || eventType;
}

function eventDescription(event: EventRow): string | null {
  if (event.event_type === "stage_change") {
    const from = (event.metadata?.from as string) || "-";
    const to = (event.metadata?.to as string) || "-";
    return `${from} → ${to}`;
  }
  if (event.event_type === "manual_message") {
    return (event.metadata?.text as string) || null;
  }
  return null;
}

export default function FriendDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [friend, setFriend] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponseRow[]>([]);
  const [pointTransactions, setPointTransactions] = useState<PointTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  const [aiLoading, setAiLoading] = useState<"lite" | "ai" | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiConfirm, setAiConfirm] = useState(false);

  const [messageText, setMessageText] = useState("");
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const loadFriend = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/friends/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "取得に失敗しました");
        return;
      }
      setFriend(data.friend);
      setMessages(data.messages || []);
      setEvents(data.events || []);
      setSurveyResponses(data.surveyResponses || []);
      setPointTransactions(data.pointTransactions || []);
      setNotesDraft(data.friend?.notes || "");
      setLoadError(null);
    } catch {
      setLoadError("取得に失敗しました（通信エラー）");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadFriend();
    apiFetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setAllTags(d.tags || []))
      .catch(() => {});
  }, [loadFriend]);

  async function updateStage(stage: string) {
    if (!friend) return;
    const prevStage = friend.stage;
    setFriend({ ...friend, stage });
    const res = await apiFetch(`/api/friends/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      setFriend((f) => (f ? { ...f, stage: prevStage } : f));
      return;
    }
    // ステージ変更イベントがタイムラインに追加されるので再取得
    loadFriend();
  }

  async function saveNotes() {
    setNotesSaving(true);
    try {
      const res = await apiFetch(`/api/friends/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      if (res.ok) {
        const data = await res.json();
        setFriend(data.friend);
      }
    } finally {
      setNotesSaving(false);
    }
  }

  async function addTag(override?: string) {
    const tag = (override ?? tagInput).trim();
    if (!tag) return;
    const res = await apiFetch(`/api/friends/${id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    if (res.ok) {
      const data = await res.json();
      setFriend((f) => (f ? { ...f, tags: data.tags } : f));
      setTagInput("");
      setShowTagInput(false);
      apiFetch("/api/tags")
        .then((r) => r.json())
        .then((d) => setAllTags(d.tags || []))
        .catch(() => {});
    }
  }

  async function removeTag(tag: string) {
    const res = await apiFetch(`/api/friends/${id}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    if (res.ok) {
      const data = await res.json();
      setFriend((f) => (f ? { ...f, tags: data.tags } : f));
    }
  }

  async function runAnalysis(level: "lite" | "ai") {
    // 有料のAI分析は誤タップ防止のため2度押しで実行
    if (level === "ai" && !aiConfirm) {
      setAiConfirm(true);
      setTimeout(() => setAiConfirm(false), 4000);
      return;
    }
    setAiConfirm(false);
    setAiLoading(level);
    setAiError(null);
    try {
      const res = await apiFetch(`/api/friends/${id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 501) {
        setAiError(
          data.error ||
            "ANTHROPIC_API_KEY が設定されていません。管理者に環境変数の設定を確認してください。"
        );
        return;
      }
      if (!res.ok) {
        setAiError(data.error || "分析に失敗しました");
        return;
      }
      await loadFriend();
    } catch {
      setAiError("分析に失敗しました（通信エラー）");
    } finally {
      setAiLoading(null);
    }
  }

  async function sendManualMessage() {
    if (!messageText.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await apiFetch(`/api/friends/${id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: messageText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(data.error || "送信に失敗しました");
        return;
      }
      setMessageText("");
      setSendDialogOpen(false);
      await loadFriend();
    } catch {
      setSendError("送信に失敗しました（通信エラー）");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !friend) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/bot/users")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          一覧へ戻る
        </Button>
        <p className="text-sm text-red-600">{loadError || "友だちが見つかりません"}</p>
      </div>
    );
  }

  const band = scoreBand(friend.engagement_score || 0);

  // メッセージとイベントを時系列（新しい順）でマージ
  const timeline = [
    ...messages.map((m) => ({ kind: "message" as const, created_at: m.created_at, data: m })),
    ...events.map((e) => ({ kind: "event" as const, created_at: e.created_at, data: e })),
  ].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/bot/users")}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        一覧へ戻る
      </Button>

      {/* ヘッダー */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                {friend.picture_url && <AvatarImage src={friend.picture_url} />}
                <AvatarFallback className="bg-[#06C755] text-white text-lg">
                  {friend.display_name?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-lg font-bold">{friend.display_name}</div>
                <div className="text-xs text-muted-foreground">
                  {friend.line_user_id.startsWith("manual_")
                    ? "手動登録"
                    : friend.line_user_id}
                </div>
                {friend.status_message && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {friend.status_message}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Select value={friend.stage || "新規"} onValueChange={(v) => updateStage(v as string)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge className={`text-xs ${scoreBandColor(band)}`}>
                {band}（{friend.engagement_score ?? 0}点）
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Coins className="h-3 w-3 mr-1" />
                {friend.points ?? 0}pt
              </Badge>
            </div>
          </div>

          {/* タグ */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {(friend.tags || []).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-xs group cursor-pointer hover:bg-red-50 hover:border-red-300"
                onClick={() => removeTag(tag)}
              >
                <TagIcon className="h-3 w-3 mr-1" />
                {tag}
                <X className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 text-red-500" />
              </Badge>
            ))}
            {showTagInput ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <Input
                    className="h-6 w-32 text-xs"
                    placeholder="タグ名"
                    list="friend-tags-suggestions"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addTag();
                      if (e.key === "Escape") setShowTagInput(false);
                    }}
                    autoFocus
                  />
                  <datalist id="friend-tags-suggestions">
                    {allTags
                      .filter((t) => !(friend.tags || []).includes(t))
                      .map((t) => (
                        <option key={t} value={t} />
                      ))}
                  </datalist>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => addTag()}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                className="rounded border border-dashed border-muted-foreground/30 px-1.5 py-0.5 text-xs text-muted-foreground hover:border-[#06C755] hover:text-[#06C755]"
                onClick={() => setShowTagInput(true)}
              >
                + タグ
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* メモ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">メモ</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="この友だちについてのメモ..."
              className="min-h-24"
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={saveNotes} disabled={notesSaving}>
                {notesSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                保存
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI分析 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#06C755]" />
              AI分析
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {friend.ai_summary ? (
              <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
                {friend.ai_summary}
                {friend.ai_summary_at && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    分析日時: {formatDateTime(friend.ai_summary_at)}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                まだAI分析が実行されていません。
              </p>
            )}
            {aiError && <p className="text-xs text-red-600">{aiError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => runAnalysis("lite")}
                disabled={aiLoading !== null}
              >
                {aiLoading === "lite" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {aiLoading === "lite" ? "分析中..." : "ライト分析（無料・即時）"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runAnalysis("ai")}
                disabled={aiLoading !== null}
                className={aiConfirm ? "border-amber-500 text-amber-600" : ""}
              >
                {aiLoading === "ai" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {aiLoading === "ai"
                  ? "AI分析中...（数十秒かかります）"
                  : aiConfirm
                    ? "もう一度押すと実行（数円かかります）"
                    : "AI分析（有料・数円）"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              ライト分析は行動データから自動生成（何回でも0円）。AI分析はClaudeによる本格的な人物像・文面案の生成（1回数円）で、ここぞという相手だけに使うのがおすすめです。
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 1:1送信 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1:1メッセージ送信</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="送信するメッセージを入力..."
            className="min-h-20"
          />
          {sendError && <p className="text-xs text-red-600">{sendError}</p>}
          <div className="flex justify-end">
            <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
              <DialogTrigger
                render={<Button disabled={!messageText.trim()} className="bg-[#06C755] hover:bg-[#05b34c]" />}
              >
                <Send className="h-4 w-4 mr-2" />
                送信
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>このメッセージを送信しますか？</DialogTitle>
                  <DialogDescription>
                    {friend.display_name} さんにLINEで送信されます。取り消せません。
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
                  {messageText}
                </div>
                {sendError && <p className="text-xs text-red-600">{sendError}</p>}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setSendDialogOpen(false)}
                    disabled={sending}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={sendManualMessage}
                    disabled={sending}
                    className="bg-[#06C755] hover:bg-[#05b34c]"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    送信する
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* タイムライン */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            タイムライン
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              まだ履歴がありません
            </p>
          ) : (
            <div className="space-y-2">
              {timeline.map((item) => {
                if (item.kind === "message") {
                  const m = item.data;
                  const isOut = m.direction === "out";
                  return (
                    <div
                      key={`msg-${m.id}`}
                      className={`flex ${isOut ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          isOut
                            ? "bg-[#06C755] text-white"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{m.content || "(本文なし)"}</div>
                        <div
                          className={`mt-1 text-[10px] ${
                            isOut ? "text-white/80" : "text-muted-foreground"
                          }`}
                        >
                          {isOut ? "送信" : "受信"} ・ {m.source} ・{" "}
                          {formatDateTime(m.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                }
                const e = item.data;
                const desc = eventDescription(e);
                return (
                  <div
                    key={`evt-${e.id}`}
                    className="flex items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground"
                  >
                    <Badge variant="secondary" className="text-[10px]">
                      {eventLabel(e.event_type)}
                    </Badge>
                    {desc && <span>{desc}</span>}
                    <span className="ml-auto">{formatDateTime(e.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* アンケート回答履歴 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              アンケート回答履歴
            </CardTitle>
          </CardHeader>
          <CardContent>
            {surveyResponses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                回答履歴がありません
              </p>
            ) : (
              <div className="space-y-2">
                {surveyResponses.map((r) => (
                  <div key={r.id} className="rounded-md border px-3 py-2 text-sm">
                    <div className="text-xs text-muted-foreground">
                      {r.surveys?.title || "アンケート"}
                    </div>
                    <div className="font-medium">
                      {r.survey_questions?.question_text || "-"}
                    </div>
                    <div className="text-[#06C755]">
                      → {r.survey_choices?.choice_text || "-"}
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {formatDateTime(r.responded_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ポイント履歴 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="h-4 w-4" />
              ポイント履歴
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pointTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                ポイント履歴がありません
              </p>
            ) : (
              <div className="space-y-2">
                {pointTransactions.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{p.reason}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDateTime(p.created_at)}
                      </div>
                    </div>
                    <span
                      className={
                        p.amount >= 0
                          ? "font-bold text-[#06C755]"
                          : "font-bold text-red-500"
                      }
                    >
                      {p.amount >= 0 ? `+${p.amount}` : p.amount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
