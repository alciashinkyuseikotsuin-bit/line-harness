"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type StepMessage = {
  message_text: string;
  delay_minutes: number;
};

type StepFlow = {
  id: string;
  name: string;
  trigger_tag: string;
  status: string;
  enrolled_count: number;
  step_messages: {
    id: string;
    message_text: string;
    delay_minutes: number;
    sort_order: number;
  }[];
  created_at: string;
};

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
  const [triggerTag, setTriggerTag] = useState("");
  const [steps, setSteps] = useState<StepMessage[]>([
    { message_text: "", delay_minutes: 0 },
  ]);
  const [creating, setCreating] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);

  function loadFlows() {
    fetch("/api/step-flows")
      .then((r) => r.json())
      .then((d) => setFlows(d.flows || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadFlows();
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setAllTags(d.tags || []))
      .catch(() => {});
  }, []);

  async function createFlow() {
    if (!name || !triggerTag || steps.some((s) => !s.message_text.trim())) return;
    setCreating(true);
    try {
      const res = await fetch("/api/step-flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, trigger_tag: triggerTag, steps }),
      });
      if (res.ok) {
        setShowCreate(false);
        setName("");
        setTriggerTag("");
        setSteps([{ message_text: "", delay_minutes: 0 }]);
        loadFlows();
      }
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(flow: StepFlow) {
    const newStatus = flow.status === "active" ? "paused" : "active";
    await fetch(`/api/step-flows/${flow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    loadFlows();
  }

  async function deleteFlow(id: string) {
    await fetch(`/api/step-flows/${id}`, { method: "DELETE" });
    loadFlows();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ステップ配信</h1>
        <Button
          className="bg-[#06C755] hover:bg-[#05b34c]"
          onClick={() => setShowCreate(true)}
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
                <h3 className="font-bold">新規ステップフロー</h3>
                <button onClick={() => setShowCreate(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium mb-1 block">フロー名</label>
                    <Input
                      placeholder="例: 新規登録ウェルカム"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      トリガータグ（このタグが付いたら開始）
                    </label>
                    <Input
                      placeholder="例: 業種:整体院"
                      value={triggerTag}
                      onChange={(e) => setTriggerTag(e.target.value)}
                      list="tag-suggestions"
                    />
                    <datalist id="tag-suggestions">
                      {allTags.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">ステップ</label>
                  <div className="space-y-3">
                    {steps.map((step, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="flex flex-col items-center gap-1 pt-2">
                          <div className="rounded-full bg-[#06C755] text-white w-6 h-6 flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </div>
                          {i < steps.length - 1 && (
                            <div className="w-px h-8 bg-muted-foreground/30" />
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <select
                              className="rounded-md border px-2 py-1 text-sm"
                              value={step.delay_minutes}
                              onChange={(e) => {
                                const newSteps = [...steps];
                                newSteps[i].delay_minutes = Number(e.target.value);
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
                            {steps.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500"
                                onClick={() =>
                                  setSteps(steps.filter((_, j) => j !== i))
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Textarea
                            placeholder="メッセージ内容"
                            rows={2}
                            value={step.message_text}
                            onChange={(e) => {
                              const newSteps = [...steps];
                              newSteps[i].message_text = e.target.value;
                              setSteps(newSteps);
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      setSteps([...steps, { message_text: "", delay_minutes: 1440 }])
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    ステップ追加
                  </Button>
                </div>

                <Button
                  className="w-full bg-[#06C755] hover:bg-[#05b34c]"
                  disabled={creating || !name || !triggerTag}
                  onClick={createFlow}
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  フローを作成
                </Button>
              </div>
            </CardContent>
          </Card>
          <LinePreview messages={steps.map((s) => s.message_text)} />
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
            <Button
              variant="outline"
              onClick={() => setShowCreate(true)}
            >
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
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      トリガー: {flow.trigger_tag}
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
                        : "bg-yellow-100 text-yellow-700 cursor-pointer"
                    }
                    onClick={() => toggleStatus(flow)}
                  >
                    {flow.status === "active" ? "稼働中" : "一時停止"}
                  </Badge>
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
                    <div key={step.id} className="flex items-center gap-2 shrink-0">
                      <div className="rounded-lg border bg-muted/50 p-3 min-w-[160px]">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <Clock className="h-3 w-3" />
                          {delayLabel(step.delay_minutes)}
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <MessageSquare className="h-3 w-3 shrink-0" />
                          <span className="truncate">{step.message_text.slice(0, 30)}</span>
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
