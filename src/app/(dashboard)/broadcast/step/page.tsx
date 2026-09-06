"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus,
  ArrowRight,
  Clock,
  MessageSquare,
  Tag,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import { LinePreview } from "@/components/line-preview";
import { MessageBlockEditor } from "@/components/message-block-editor";
import type { MessageBlock } from "@/types/blocks";
import { createBlock } from "@/types/blocks";

type StepMessage = {
  blocks: MessageBlock[];
  delay_minutes: number;
};

type StepFlow = {
  id: string;
  name: string;
  trigger_tag: string | null;
  trigger_tags: string[] | null;
  trigger_match_mode: "any" | "all" | null;
  status: string;
  enrolled_count: number;
  step_messages: {
    id: string;
    message_text: string;
    message_blocks: MessageBlock[] | null;
    delay_minutes: number;
    sort_order: number;
  }[];
  created_at: string;
};

// 一覧表示用に、新形式 trigger_tags があればそれ、無ければ trigger_tag を1要素配列に
function getEffectiveTriggers(flow: StepFlow): string[] {
  if (flow.trigger_tags && flow.trigger_tags.length > 0) return flow.trigger_tags;
  if (flow.trigger_tag) return [flow.trigger_tag];
  return [];
}

function delayLabel(minutes: number): string {
  if (minutes === 0) return "即時";
  if (minutes < 60) return `${minutes}分後`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}時間後`;
  return `${Math.round(minutes / 1440)}日後`;
}

export default function StepPage() {
  const [flows, setFlows] = useState<StepFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [triggerTags, setTriggerTags] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<"any" | "all">("any");
  const [newTagInput, setNewTagInput] = useState("");
  const [steps, setSteps] = useState<StepMessage[]>([
    { blocks: [createBlock("text")], delay_minutes: 0 },
  ]);
  const [creating, setCreating] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [surveys, setSurveys] = useState<{ id: string; title: string }[]>([]);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);

  function loadFlows() {
    apiFetch("/api/step-flows")
      .then((r) => r.json())
      .then((d) => setFlows(d.flows || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadFlows();
    apiFetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setAllTags(d.tags || []))
      .catch(() => {});
    apiFetch("/api/surveys")
      .then((r) => r.json())
      .then((d) =>
        setSurveys(
          (d.surveys || []).map((s: { id: string; title: string }) => ({ id: s.id, title: s.title }))
        )
      )
      .catch(() => {});
  }, []);

  function resetForm() {
    setName("");
    setTriggerTags([]);
    setMatchMode("any");
    setNewTagInput("");
    setSteps([{ blocks: [createBlock("text")], delay_minutes: 0 }]);
    setActiveStepIndex(0);
    setEditingFlowId(null);
  }

  function buildStepsPayload() {
    return steps.map((s) => ({
      message_text:
        s.blocks
          .filter((b) => b.type === "text" && b.text)
          .map((b) => b.text)
          .join("\n") || "（メディアメッセージ）",
      message_blocks: s.blocks,
      delay_minutes: s.delay_minutes,
    }));
  }

  // 編集モードでフローを読み込む
  async function openFlowForEdit(flowId: string) {
    const res = await apiFetch(`/api/step-flows/${flowId}`);
    const data = await res.json();
    if (!res.ok || !data.flow) {
      alert(data.error || "フローの読み込みに失敗しました");
      return;
    }
    const f = data.flow;
    setEditingFlowId(flowId);
    setName(f.name || "");
    setTriggerTags(
      Array.isArray(f.trigger_tags) && f.trigger_tags.length > 0
        ? f.trigger_tags
        : f.trigger_tag
          ? [f.trigger_tag]
          : []
    );
    setMatchMode(f.trigger_match_mode === "all" ? "all" : "any");
    const loadedSteps = (f.step_messages || []).map(
      (m: { message_blocks: MessageBlock[] | null; delay_minutes: number }) => ({
        blocks:
          Array.isArray(m.message_blocks) && m.message_blocks.length > 0
            ? m.message_blocks
            : [createBlock("text")],
        delay_minutes: m.delay_minutes || 0,
      })
    );
    setSteps(
      loadedSteps.length > 0
        ? loadedSteps
        : [{ blocks: [createBlock("text")], delay_minutes: 0 }]
    );
    setActiveStepIndex(0);
    setShowCreate(true);
  }

  // 「フロー作成」or「下書き保存」（saveAsDraft=true で status=draft）
  async function createFlow(opts: { saveAsDraft?: boolean } = {}) {
    if (!name) {
      alert("フロー名を入力してください");
      return;
    }
    if (!opts.saveAsDraft && triggerTags.length === 0) {
      alert("トリガータグを1つ以上選択してください");
      return;
    }
    const setBusy = opts.saveAsDraft ? setSavingDraft : setCreating;
    setBusy(true);
    try {
      const stepsData = buildStepsPayload();
      const payload = {
        name,
        trigger_tags: triggerTags,
        trigger_match_mode: matchMode,
        steps: stepsData,
        ...(opts.saveAsDraft ? { saveAsDraft: true } : {}),
      };

      let res;
      if (editingFlowId) {
        // 編集: PATCH
        const patchPayload: Record<string, unknown> = { ...payload };
        if (opts.saveAsDraft) {
          patchPayload.status = "draft";
        }
        delete (patchPayload as Record<string, unknown>).saveAsDraft;
        res = await apiFetch(`/api/step-flows/${editingFlowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchPayload),
        });
      } else {
        res = await apiFetch("/api/step-flows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (res.ok) {
        setShowCreate(false);
        resetForm();
        loadFlows();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "保存に失敗しました");
      }
    } finally {
      setBusy(false);
    }
  }

  function addTrigger(tag: string) {
    const t = tag.trim();
    if (!t) return;
    if (triggerTags.includes(t)) return;
    setTriggerTags([...triggerTags, t]);
  }

  function removeTrigger(tag: string) {
    setTriggerTags(triggerTags.filter((t) => t !== tag));
  }

  async function toggleStatus(flow: StepFlow) {
    const newStatus = flow.status === "active" ? "paused" : "active";
    await apiFetch(`/api/step-flows/${flow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    loadFlows();
  }

  async function deleteFlow(id: string) {
    await apiFetch(`/api/step-flows/${id}`, { method: "DELETE" });
    loadFlows();
  }

  // プレビュー用: アクティブなステップのブロックを表示
  const previewBlocks =
    steps[activeStepIndex]?.blocks || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ステップ配信</h1>
        <Button
          className="bg-[#06C755] hover:bg-[#05b34c]"
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          フロー作成
        </Button>
      </div>

      {/* フロー作成フォーム */}
      {showCreate && (
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <Card className="border-[#06C755]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold">
                  {editingFlowId ? "フローを編集" : "新規ステップフロー"}
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
                    フロー名
                  </label>
                  <Input
                    placeholder="例: 新規登録ウェルカム"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* トリガータグ（複数選択 + AND/OR） */}
                <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-sm font-medium">
                      トリガータグ（このタグが付いたらフロー開始）
                    </label>
                    <div className="flex items-center gap-1 rounded-md border bg-background p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setMatchMode("any")}
                        className={`px-2 py-1 rounded ${
                          matchMode === "any"
                            ? "bg-[#06C755] text-white"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        いずれか1つ (OR)
                      </button>
                      <button
                        type="button"
                        onClick={() => setMatchMode("all")}
                        className={`px-2 py-1 rounded ${
                          matchMode === "all"
                            ? "bg-[#06C755] text-white"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        すべて (AND)
                      </button>
                    </div>
                  </div>

                  {/* 選択済みタグ */}
                  {triggerTags.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      タグが選択されていません。下から1つ以上選んでください。
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {triggerTags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-full bg-[#06C755] text-white px-3 py-1 text-xs"
                        >
                          <Tag className="h-3 w-3" />
                          {t}
                          <button
                            type="button"
                            onClick={() => removeTrigger(t)}
                            className="ml-1 hover:opacity-70"
                            aria-label={`${t}を削除`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 既存タグから選ぶ */}
                  {allTags.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">
                        既存タグから追加
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {allTags
                          .filter((t) => !triggerTags.includes(t))
                          .map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => addTrigger(t)}
                              className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/30 px-2.5 py-1 text-xs hover:border-[#06C755]/60 hover:bg-[#06C755]/5"
                            >
                              <Plus className="h-3 w-3" />
                              {t}
                            </button>
                          ))}
                        {allTags.filter((t) => !triggerTags.includes(t)).length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            既存タグはすべて追加済みです
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 新規タグを追加 */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">
                      新しいタグを入力して追加
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="例: 業種:整体院"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTrigger(newTagInput);
                            setNewTagInput("");
                          }
                        }}
                        className="text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          addTrigger(newTagInput);
                          setNewTagInput("");
                        }}
                        disabled={!newTagInput.trim()}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        追加
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    ステップ
                  </label>
                  <div className="space-y-4">
                    {steps.map((step, i) => (
                      <div
                        key={i}
                        className={`rounded-lg border-2 p-4 transition-colors cursor-pointer ${
                          activeStepIndex === i
                            ? "border-[#06C755] bg-[#06C755]/5"
                            : "border-muted hover:border-[#06C755]/30"
                        }`}
                        onClick={() => setActiveStepIndex(i)}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="rounded-full bg-[#06C755] text-white w-6 h-6 flex items-center justify-center text-xs font-bold">
                              {i + 1}
                            </div>
                            <select
                              className="rounded-md border px-2 py-1 text-sm"
                              value={step.delay_minutes}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const newSteps = [...steps];
                                newSteps[i].delay_minutes = Number(
                                  e.target.value
                                );
                                setSteps(newSteps);
                              }}
                            >
                              <option value={0}>即時</option>
                              <option value={30}>30分後</option>
                              <option value={60}>1時間後</option>
                              <option value={180}>3時間後</option>
                              <option value={720}>12時間後</option>
                              <option value={1440}>1日後</option>
                              <option value={4320}>3日後</option>
                              <option value={10080}>7日後</option>
                              <option value={20160}>14日後</option>
                              <option value={43200}>30日後</option>
                            </select>
                          </div>
                          {steps.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newSteps = steps.filter(
                                  (_, j) => j !== i
                                );
                                setSteps(newSteps);
                                if (activeStepIndex >= newSteps.length) {
                                  setActiveStepIndex(newSteps.length - 1);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {activeStepIndex === i && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <MessageBlockEditor
                              blocks={step.blocks}
                              onChange={(newBlocks) => {
                                const newSteps = [...steps];
                                newSteps[i].blocks = newBlocks;
                                setSteps(newSteps);
                              }}
                              surveys={surveys}
                            />
                          </div>
                        )}
                        {activeStepIndex !== i && (
                          <p className="text-xs text-muted-foreground">
                            {step.blocks.length}ブロック - クリックして編集
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setSteps([
                        ...steps,
                        {
                          blocks: [createBlock("text")],
                          delay_minutes: 1440,
                        },
                      ]);
                      setActiveStepIndex(steps.length);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    ステップ追加
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={savingDraft || !name}
                    onClick={() => createFlow({ saveAsDraft: true })}
                  >
                    {savingDraft ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    下書き保存
                  </Button>
                  <Button
                    className="flex-1 bg-[#06C755] hover:bg-[#05b34c]"
                    disabled={creating || !name || triggerTags.length === 0}
                    onClick={() => createFlow()}
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    {editingFlowId ? "保存して有効化" : "フローを作成"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <div>
            <p className="text-xs text-muted-foreground text-center mb-1">
              ステップ {activeStepIndex + 1} のプレビュー
            </p>
            <LinePreview blocks={previewBlocks} />
          </div>
        </div>
      )}

      {/* フロー一覧 */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          読み込み中...
        </p>
      ) : flows.length === 0 && !showCreate ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              ステップフローがありません
            </p>
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              最初のフローを作成
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {flows.map((flow) => (
            <Card
              key={flow.id}
              className="hover:border-[#06C755]/50 transition-colors"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-base">{flow.name}</CardTitle>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1 flex-wrap">
                      <Tag className="h-3 w-3" />
                      トリガー:
                      {getEffectiveTriggers(flow).map((t, i, arr) => (
                        <span key={t} className="inline-flex items-center">
                          <Badge variant="outline" className="text-xs">
                            {t}
                          </Badge>
                          {i < arr.length - 1 && (
                            <span className="mx-1 font-bold">
                              {flow.trigger_match_mode === "all" ? "AND" : "OR"}
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                    <span>登録: {flow.enrolled_count}人</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={
                      flow.status === "active"
                        ? "bg-green-100 text-green-700 cursor-pointer"
                        : flow.status === "draft"
                          ? "bg-gray-100 text-gray-500"
                          : "bg-yellow-100 text-yellow-700 cursor-pointer"
                    }
                    onClick={() => {
                      // 下書きはステータス切替不可（編集経由で有効化）
                      if (flow.status !== "draft") toggleStatus(flow);
                    }}
                  >
                    {flow.status === "active"
                      ? "稼働中"
                      : flow.status === "draft"
                        ? "下書き"
                        : "一時停止"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openFlowForEdit(flow.id)}
                  >
                    編集
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500"
                    onClick={() => deleteFlow(flow.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {(flow.step_messages || []).map((step, i) => (
                    <div
                      key={step.id}
                      className="flex items-center gap-2 shrink-0"
                    >
                      <div className="rounded-lg border bg-muted/50 p-3 min-w-[160px]">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <Clock className="h-3 w-3" />
                          {delayLabel(step.delay_minutes)}
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <MessageSquare className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {step.message_text.slice(0, 30)}
                          </span>
                        </div>
                      </div>
                      {i < flow.step_messages.length - 1 && (
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
