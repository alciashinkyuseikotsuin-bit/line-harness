"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Send, X, Loader2, Tag, Users, FileText, Trash2, Clock } from "lucide-react";
import { LinePreview } from "@/components/line-preview";
import { MessageBlockEditor } from "@/components/message-block-editor";
import type { MessageBlock } from "@/types/blocks";
import { createBlock } from "@/types/blocks";

type Broadcast = {
  id: string;
  title: string;
  message_text: string;
  message_blocks?: MessageBlock[] | null;
  target_type: string;
  target_tags?: string[];
  status: string;
  sent_at: string | null;
  scheduled_at?: string | null;
  delivered_count: number;
  created_at: string;
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent: "bg-green-100 text-green-700",
    scheduled: "bg-blue-100 text-blue-700",
    draft: "bg-gray-100 text-gray-500",
    failed: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    sent: "配信済み",
    scheduled: "予約中",
    draft: "下書き",
    failed: "失敗",
  };
  return (
    <Badge variant="secondary" className={styles[status] || styles.draft}>
      {labels[status] || status}
    </Badge>
  );
}

type TagInfo = { name: string; count: number };

export default function BroadcastPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<MessageBlock[]>([createBlock("text")]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [friendCount, setFriendCount] = useState(0);
  const [testDone, setTestDone] = useState(false);
  const [surveys, setSurveys] = useState<{ id: string; title: string }[]>([]);
  const [targetMode, setTargetMode] = useState<"all" | "tags">("all");
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [matchCount, setMatchCount] = useState(0);
  const [friendsWithTags, setFriendsWithTags] = useState<
    { tags: string[] | null }[]
  >([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState(""); // datetime-local
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    apiFetch("/api/broadcast")
      .then((r) => r.json())
      .then((d) => setBroadcasts(d.broadcasts || []))
      .catch(console.error)
      .finally(() => setLoading(false));

    apiFetch("/api/friends")
      .then((r) => r.json())
      .then((d) => {
        const friends = d.friends || [];
        setFriendCount(friends.length);
        setFriendsWithTags(friends);
      });

    apiFetch("/api/surveys")
      .then((r) => r.json())
      .then((d) =>
        setSurveys(
          (d.surveys || []).map((s: { id: string; title: string }) => ({ id: s.id, title: s.title }))
        )
      )
      .catch(() => {});

    apiFetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setAllTags(d.details || []))
      .catch(() => {});
  }, []);

  // 選択タグに応じてマッチ人数を再計算
  useEffect(() => {
    if (selectedTags.length === 0 || friendsWithTags.length === 0) {
      setMatchCount(0);
      return;
    }
    const matched = friendsWithTags.filter((f) =>
      selectedTags.some((t) => (f.tags || []).includes(t))
    );
    setMatchCount(matched.length);
  }, [selectedTags, friendsWithTags]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function resetForm() {
    setTitle("");
    setBlocks([createBlock("text")]);
    setTargetMode("all");
    setSelectedTags([]);
    setTestDone(false);
    setEditingDraftId(null);
    setScheduledAt("");
  }

  async function schedule() {
    if (!scheduledAt) {
      alert("予約日時を入力してください");
      return;
    }
    if (!hasContent) {
      alert("メッセージを入力してください");
      return;
    }
    if (targetMode === "tags" && selectedTags.length === 0) {
      alert("配信対象タグを1つ以上選択してください");
      return;
    }
    setScheduling(true);
    setResult(null);
    try {
      const payload = {
        title: title || "予約配信",
        blocks,
        targetType: targetMode === "tags" ? "segment" : "all",
        targetTags: selectedTags,
        scheduledAt: new Date(scheduledAt).toISOString(),
      };
      let res;
      if (editingDraftId) {
        // 編集中下書きを予約配信に切り替え
        res = await apiFetch(`/api/broadcast/${editingDraftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch("/api/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setResult(`❌ ${data.error || "予約に失敗しました"}`);
        return;
      }
      setResult(
        `✅ ${new Date(scheduledAt).toLocaleString("ja-JP")} に配信予約しました`
      );
      const listRes = await apiFetch("/api/broadcast");
      const listData = await listRes.json();
      setBroadcasts(listData.broadcasts || []);
      setShowCreate(false);
      setShowConfirm(false);
      resetForm();
    } finally {
      setScheduling(false);
    }
  }

  // 下書きを編集モードで開く
  async function openDraft(d: Broadcast) {
    const res = await apiFetch(`/api/broadcast/${d.id}`);
    const data = await res.json();
    if (!res.ok || !data.broadcast) {
      alert(data.error || "下書きの読み込みに失敗しました");
      return;
    }
    const b = data.broadcast;
    setEditingDraftId(b.id);
    setTitle(b.title || "");
    setBlocks(
      Array.isArray(b.message_blocks) && b.message_blocks.length > 0
        ? b.message_blocks
        : [createBlock("text")]
    );
    setTargetMode(b.target_type === "segment" ? "tags" : "all");
    setSelectedTags(Array.isArray(b.target_tags) ? b.target_tags : []);
    setTestDone(false);
    // scheduled_at を datetime-local 形式 (YYYY-MM-DDTHH:mm) に変換
    if (b.scheduled_at) {
      const d = new Date(b.scheduled_at);
      const pad = (n: number) => String(n).padStart(2, "0");
      setScheduledAt(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      );
    } else {
      setScheduledAt("");
    }
    setShowCreate(true);
    setShowConfirm(false);
  }

  // 下書き保存（編集中ならPATCH、新規ならPOST saveAsDraft）
  async function saveAsDraft() {
    if (!title.trim() && !hasContent) {
      alert("タイトルかメッセージを入力してから保存してください");
      return;
    }
    setSavingDraft(true);
    try {
      const payload = {
        title: title || "下書き",
        blocks,
        targetType: targetMode === "tags" ? "segment" : "all",
        targetTags: selectedTags,
      };
      let res;
      if (editingDraftId) {
        res = await apiFetch(`/api/broadcast/${editingDraftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch("/api/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, saveAsDraft: true }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "保存に失敗しました");
        return;
      }
      setResult("✅ 下書きを保存しました");
      // 一覧を再読込してフォームを閉じる
      const listRes = await apiFetch("/api/broadcast");
      const listData = await listRes.json();
      setBroadcasts(listData.broadcasts || []);
      setShowCreate(false);
      setShowConfirm(false);
      resetForm();
    } finally {
      setSavingDraft(false);
    }
  }

  async function deleteBroadcast(id: string) {
    const res = await apiFetch(`/api/broadcast/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmDeleteId(null);
      const listRes = await apiFetch("/api/broadcast");
      const listData = await listRes.json();
      setBroadcasts(listData.broadcasts || []);
    }
  }

  const hasContent = blocks.some((b) => {
    if (b.type === "text") return b.text?.trim();
    if (b.type === "image") return b.url;
    if (b.type === "video") return b.url && b.previewUrl;
    if (b.type === "survey") return b.surveyId;
    return false;
  });

  // テスト配信（堀優介のみ）
  async function sendTestBroadcast() {
    setSending(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[テスト] ${title || "一斉配信"}`,
          blocks,
          targetType: "segment",
          targetTags: ["テスト配信"],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(
          `✅ テスト配信完了: ${data.deliveredCount}人に送信しました（テスト配信タグの友だちのみ）`
        );
        setTestDone(true);
      } else {
        setResult(`❌ エラー: ${data.error}`);
      }
    } catch {
      setResult("❌ テスト配信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  // 本配信（全員 or タグ絞り）
  async function sendBroadcast() {
    if (!testDone) {
      alert("先にテスト配信を行ってください");
      return;
    }
    if (targetMode === "tags" && selectedTags.length === 0) {
      alert("配信対象タグを1つ以上選択してください");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const payload: Record<string, unknown> = {
        title: title || "一斉配信",
        blocks,
        targetType: targetMode === "tags" ? "segment" : "all",
      };
      if (targetMode === "tags") {
        payload.targetTags = selectedTags;
      }

      const res = await apiFetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`配信完了: ${data.deliveredCount}人に送信しました`);
        // 編集していた下書きがあれば削除（履歴に「下書き」と「配信済み」が両方残らないように）
        if (editingDraftId) {
          await apiFetch(`/api/broadcast/${editingDraftId}`, { method: "DELETE" });
        }
        setShowCreate(false);
        setShowConfirm(false);
        resetForm();
        const listRes = await apiFetch("/api/broadcast");
        const listData = await listRes.json();
        setBroadcasts(listData.broadcasts || []);
      } else {
        setResult(`エラー: ${data.error}`);
      }
    } catch {
      setResult("配信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  const sentBroadcasts = broadcasts.filter((b) => b.status === "sent");
  const totalDelivered = sentBroadcasts.reduce(
    (s, b) => s + (b.delivered_count || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">一斉配信</h1>
        <Button
          className="bg-[#06C755] hover:bg-[#05b34c]"
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          新規配信
        </Button>
      </div>

      {/* 新規配信フォーム */}
      {showCreate && !showConfirm && (
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <Card className="border-[#06C755]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold">
                  {editingDraftId ? "下書きを編集" : "新規一斉配信"}
                </h3>
                <button
                  onClick={() => {
                    setShowCreate(false);
                    resetForm();
                  }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    タイトル（管理用）
                  </label>
                  <Input
                    placeholder="配信のタイトル"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    メッセージ（最大5ブロック）
                  </label>
                  <MessageBlockEditor
                    blocks={blocks}
                    onChange={setBlocks}
                    surveys={surveys}
                  />
                </div>

                {/* 配信対象 */}
                <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-sm font-medium">配信対象</label>
                    <div className="flex items-center gap-1 rounded-md border bg-background p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetMode("all");
                          setSelectedTags([]);
                        }}
                        className={`px-2 py-1 rounded ${
                          targetMode === "all"
                            ? "bg-[#06C755] text-white"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        全員
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetMode("tags")}
                        className={`px-2 py-1 rounded ${
                          targetMode === "tags"
                            ? "bg-[#06C755] text-white"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        タグで絞る
                      </button>
                    </div>
                  </div>

                  {targetMode === "all" ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      全友だち（{friendCount}人）に配信
                    </p>
                  ) : (
                    <>
                      {allTags.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          タグがまだありません。タグ管理画面で作成するか、アンケート回答で自動付与されると選択できます。
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {allTags.map((tag) => (
                            <button
                              key={tag.name}
                              type="button"
                              onClick={() => toggleTag(tag.name)}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                                selectedTags.includes(tag.name)
                                  ? "border-[#06C755] bg-[#06C755]/10 text-[#06C755]"
                                  : "border-muted-foreground/30 hover:border-[#06C755]/50"
                              }`}
                            >
                              <Tag className="h-3 w-3" />
                              {tag.name}
                              <span className="text-[10px] text-muted-foreground">
                                {tag.count}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedTags.length > 0 && (
                        <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2 border">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            対象: {matchCount}人
                          </span>
                          <span className="text-xs text-muted-foreground">
                            （いずれかのタグにマッチ）
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* 予約配信 */}
                <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    予約配信日時（任意）
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      className="border-blue-400 text-blue-600 hover:bg-blue-50"
                      disabled={
                        scheduling ||
                        !scheduledAt ||
                        !hasContent ||
                        (targetMode === "tags" && selectedTags.length === 0)
                      }
                      onClick={schedule}
                    >
                      {scheduling ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Clock className="h-4 w-4 mr-2" />
                      )}
                      予約配信
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    指定日時にバックグラウンドで自動送信されます。
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={savingDraft}
                    onClick={saveAsDraft}
                  >
                    {savingDraft ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    下書き保存
                  </Button>
                  <Button
                    className="flex-1 bg-[#06C755] hover:bg-[#05b34c]"
                    disabled={
                      !hasContent ||
                      (targetMode === "tags" && selectedTags.length === 0)
                    }
                    onClick={() => setShowConfirm(true)}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    すぐに配信
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <LinePreview blocks={blocks} />
        </div>
      )}

      {/* 確認ダイアログ */}
      {showConfirm && (
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <Card className="border-[#06C755] border-2">
            <CardContent className="pt-6">
              <h3 className="font-bold text-lg mb-4">配信内容の確認</h3>
              <div className="space-y-3 mb-6">
                <div>
                  <span className="text-sm text-muted-foreground">対象:</span>
                  {targetMode === "all" ? (
                    <span className="ml-2 font-medium">
                      全友だち（{friendCount}人）
                    </span>
                  ) : (
                    <span className="ml-2 font-medium">
                      タグ絞り込み（{matchCount}人）
                      <span className="text-xs text-muted-foreground ml-1">
                        ［{selectedTags.join(", ")}］
                      </span>
                    </span>
                  )}
                </div>
                {title && (
                  <div>
                    <span className="text-sm text-muted-foreground">
                      タイトル:
                    </span>
                    <span className="ml-2">{title}</span>
                  </div>
                )}
                <div>
                  <span className="text-sm text-muted-foreground">
                    ブロック数:
                  </span>
                  <span className="ml-2">{blocks.length}ブロック</span>
                </div>
              </div>

              {result && (
                <div
                  className={`rounded-md px-4 py-3 text-sm mb-4 ${
                    result.startsWith("✅")
                      ? "bg-green-50 text-green-800 border border-green-200"
                      : result.startsWith("❌")
                        ? "bg-red-50 text-red-800 border border-red-200"
                        : "bg-muted"
                  }`}
                >
                  {result}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowConfirm(false);
                    setTestDone(false);
                    setResult(null);
                  }}
                >
                  戻って編集
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-[#06C755] text-[#06C755] hover:bg-[#06C755]/10"
                  disabled={sending}
                  onClick={sendTestBroadcast}
                >
                  {sending && !testDone ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  テスト配信（堀優介のみ）
                </Button>
                <Button
                  className={`flex-1 ${testDone ? "bg-[#06C755] hover:bg-[#05b34c]" : "bg-gray-300 cursor-not-allowed"}`}
                  disabled={sending || !testDone}
                  onClick={sendBroadcast}
                >
                  {sending && testDone ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {testDone ? "全員に配信する" : "先にテスト配信してください"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <LinePreview blocks={blocks} />
        </div>
      )}

      {result && !showCreate && !showConfirm && (
        <div className="rounded-md bg-muted px-4 py-3 text-sm">{result}</div>
      )}

      {/* 統計・履歴はフォーム表示中は隠す（画面下が見切れるのを防ぐ） */}
      {!showCreate && !showConfirm && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  配信回数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{sentBroadcasts.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  総配信メッセージ数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {totalDelivered.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  全配信履歴
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{broadcasts.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  読み込み中...
                </p>
              ) : broadcasts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  配信履歴がありません
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>タイトル</TableHead>
                      <TableHead>配信日時</TableHead>
                      <TableHead>対象</TableHead>
                      <TableHead>配信数</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {broadcasts.map((b) => (
                      <TableRow
                        key={b.id}
                        className={
                          b.status === "draft" || b.status === "scheduled"
                            ? "cursor-pointer hover:bg-muted/50"
                            : ""
                        }
                        onClick={() => {
                          if (b.status === "draft" || b.status === "scheduled") {
                            openDraft(b);
                          }
                        }}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Send className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{b.title}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {b.sent_at ? (
                            new Date(b.sent_at).toLocaleString("ja-JP")
                          ) : b.scheduled_at ? (
                            <span className="text-blue-600">
                              {new Date(b.scheduled_at).toLocaleString("ja-JP")}{" "}
                              予定
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {b.target_type === "all"
                            ? "全友だち"
                            : b.target_type === "segment"
                              ? "セグメント"
                              : b.target_type}
                        </TableCell>
                        <TableCell className="text-sm">
                          {b.delivered_count > 0
                            ? b.delivered_count.toLocaleString()
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={b.status} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {confirmDeleteId === b.id ? (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                取消
                              </Button>
                              <Button
                                size="sm"
                                className="bg-red-600 hover:bg-red-700 text-white"
                                onClick={() => deleteBroadcast(b.id)}
                              >
                                削除
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmDeleteId(b.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
