"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Save,
  Plus,
  Gift,
  Edit2,
  Trash2,
  Loader2,
  Trophy,
  Settings,
} from "lucide-react";

type PointRules = {
  survey_answer: number;
  survey_complete: number;
  link_click: number;
  omikuji: number;
  daily_message: number;
  keyword_default: number;
};

type PointReward = {
  id: string;
  threshold: number;
  title: string;
  message: string;
  add_tag: string | null;
  active: boolean;
  claim_count: number;
};

type RankingEntry = {
  id: string;
  display_name: string | null;
  picture_url: string | null;
  points: number;
  stage: string;
};

const ruleLabels: { key: keyof PointRules; label: string; hint: string }[] = [
  { key: "survey_answer", label: "アンケート1問回答", hint: "設問に1つ回答するたび" },
  { key: "survey_complete", label: "アンケート全問完了", hint: "アンケートを最後まで回答した時" },
  { key: "link_click", label: "計測リンククリック", hint: "配信文中のリンクをクリックした時（リンクごとの個別設定が優先）" },
  { key: "omikuji", label: "おみくじを引く", hint: "1日1回おみくじを引いた時" },
  { key: "daily_message", label: "メッセージ送信（1日1回）", hint: "友だちから何かメッセージが届いた時" },
  { key: "keyword_default", label: "キーワード応答（未設定時の初期値）", hint: "自動応答個別のポイント未設定時の初期値" },
];

const emptyRewardForm = {
  threshold: 0,
  title: "",
  message: "",
  add_tag: "",
  active: true,
};

export default function PointsPage() {
  const [rules, setRules] = useState<PointRules | null>(null);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);

  const [rewards, setRewards] = useState<PointReward[]>([]);
  const [rewardsLoading, setRewardsLoading] = useState(true);
  const [rewardSaving, setRewardSaving] = useState(false);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [confirmDeleteReward, setConfirmDeleteReward] = useState<string | null>(null);
  const [rewardForm, setRewardForm] = useState(emptyRewardForm);

  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [rankingLoading, setRankingLoading] = useState(true);

  function loadRules() {
    fetch("/api/points/settings")
      .then((r) => r.json())
      .then((d) => setRules(d.rules))
      .catch(console.error);
  }

  function loadRewards() {
    setRewardsLoading(true);
    fetch("/api/rewards")
      .then((r) => r.json())
      .then((d) => setRewards(d.rewards || []))
      .catch(console.error)
      .finally(() => setRewardsLoading(false));
  }

  function loadRanking() {
    setRankingLoading(true);
    fetch("/api/points/ranking")
      .then((r) => r.json())
      .then((d) => setRanking(d.ranking || []))
      .catch(console.error)
      .finally(() => setRankingLoading(false));
  }

  useEffect(() => {
    loadRules();
    loadRewards();
    loadRanking();
  }, []);

  async function saveRules() {
    if (!rules) return;
    setRulesSaving(true);
    setRulesSaved(false);
    try {
      const res = await fetch("/api/points/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      const data = await res.json();
      if (res.ok) {
        setRules(data.rules);
        setRulesSaved(true);
        setTimeout(() => setRulesSaved(false), 2000);
      }
    } finally {
      setRulesSaving(false);
    }
  }

  function startEditReward(reward: PointReward) {
    setEditingRewardId(reward.id);
    setRewardForm({
      threshold: reward.threshold,
      title: reward.title,
      message: reward.message,
      add_tag: reward.add_tag || "",
      active: reward.active,
    });
  }

  function cancelEditReward() {
    setEditingRewardId(null);
    setRewardForm(emptyRewardForm);
    setRewardError(null);
  }

  async function submitReward() {
    setRewardError(null);
    const payload = {
      threshold: Number(rewardForm.threshold) || 0,
      title: rewardForm.title.trim(),
      message: rewardForm.message.trim(),
      add_tag: rewardForm.add_tag.trim(),
      active: rewardForm.active,
    };

    setRewardSaving(true);
    try {
      const res = await fetch(
        editingRewardId ? `/api/rewards/${editingRewardId}` : "/api/rewards",
        {
          method: editingRewardId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setRewardError(data.error || "保存に失敗しました");
        return;
      }
      cancelEditReward();
      loadRewards();
    } finally {
      setRewardSaving(false);
    }
  }

  async function deleteReward(id: string) {
    const res = await fetch(`/api/rewards/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmDeleteReward(null);
      if (editingRewardId === id) cancelEditReward();
      loadRewards();
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">ポイント管理</h1>
        <p className="text-sm text-muted-foreground">
          友だちの行動に応じたポイント付与ルール、ポイント到達特典、ランキングを管理します。
          ポイントの送信処理自体はWebhook側が担当し、ここでは設定のみを行います。
        </p>
      </div>

      {/* (a) ポイント付与ルール */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            ポイント付与ルール
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!rules ? (
            <p className="text-sm text-muted-foreground py-4 text-center">読み込み中...</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {ruleLabels.map(({ key, label, hint }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      {label}
                      <span className="block text-[10px] text-muted-foreground/70">{hint}</span>
                    </label>
                    <Input
                      type="number"
                      value={rules[key]}
                      onChange={(e) =>
                        setRules({ ...rules, [key]: Number(e.target.value) })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={saveRules}
                  disabled={rulesSaving}
                  className="bg-[#06C755] hover:bg-[#05b34c]"
                >
                  {rulesSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  保存
                </Button>
                {rulesSaved && (
                  <span className="text-xs text-green-600">保存しました</span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* (b) 特典（point_rewards） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4" />
            {editingRewardId ? "ポイント特典を編集" : "新しいポイント特典を作成"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">到達ポイント数</label>
              <Input
                type="number"
                min={1}
                value={rewardForm.threshold}
                onChange={(e) =>
                  setRewardForm({ ...rewardForm, threshold: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">特典名（管理用）</label>
              <Input
                placeholder="例: 50ptクーポン特典"
                value={rewardForm.title}
                onChange={(e) => setRewardForm({ ...rewardForm, title: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">到達時に送るメッセージ</label>
            <Textarea
              placeholder="ポイント到達時に友だちへ送るメッセージ"
              value={rewardForm.message}
              onChange={(e) => setRewardForm({ ...rewardForm, message: e.target.value })}
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">付与タグ（任意）</label>
            <Input
              placeholder="例: 50pt特典受領済み"
              value={rewardForm.add_tag}
              onChange={(e) => setRewardForm({ ...rewardForm, add_tag: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={rewardForm.active}
              onChange={(e) => setRewardForm({ ...rewardForm, active: e.target.checked })}
              className="rounded"
            />
            有効にする
          </label>

          {rewardError && <p className="text-xs text-red-600">{rewardError}</p>}

          <div className="flex gap-2">
            <Button
              onClick={submitReward}
              disabled={
                rewardSaving ||
                !rewardForm.title.trim() ||
                !rewardForm.message.trim() ||
                !rewardForm.threshold
              }
              className="bg-[#06C755] hover:bg-[#05b34c]"
            >
              {rewardSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {editingRewardId ? "更新する" : "作成"}
            </Button>
            {editingRewardId && (
              <Button variant="outline" onClick={cancelEditReward}>
                キャンセル
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Gift className="h-4 w-4" />
              特典一覧
            </span>
            <Badge variant="outline">{rewards.length}件</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rewardsLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">読み込み中...</p>
          ) : rewards.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              特典がまだありません。上から作成してください。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>到達pt</TableHead>
                  <TableHead>特典名</TableHead>
                  <TableHead>付与タグ</TableHead>
                  <TableHead>受領人数</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rewards.map((reward) => (
                  <TableRow key={reward.id}>
                    <TableCell className="font-medium text-sm">{reward.threshold}pt</TableCell>
                    <TableCell className="text-sm">{reward.title}</TableCell>
                    <TableCell>
                      {reward.add_tag ? (
                        <Badge variant="secondary" className="text-xs">
                          {reward.add_tag}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">なし</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{reward.claim_count}人</TableCell>
                    <TableCell>
                      {reward.active ? (
                        <Badge className="bg-green-100 text-green-700" variant="secondary">
                          有効
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-500" variant="secondary">
                          無効
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEditReward(reward)}>
                          <Edit2 className="h-3 w-3 mr-1" />
                          編集
                        </Button>
                        {confirmDeleteReward === reward.id ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setConfirmDeleteReward(null)}>
                              キャンセル
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => deleteReward(reward.id)}
                            >
                              削除する
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmDeleteReward(reward.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* (c) ランキング */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              ポイントランキング トップ30
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rankingLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">読み込み中...</p>
          ) : ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              まだポイントを持つ友だちがいません。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">順位</TableHead>
                  <TableHead>友だち</TableHead>
                  <TableHead>ステージ</TableHead>
                  <TableHead>ポイント</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.map((entry, i) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm font-medium">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          <AvatarImage src={entry.picture_url || undefined} />
                          <AvatarFallback>{(entry.display_name || "?").slice(0, 1)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{entry.display_name || "(名前未取得)"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {entry.stage}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{entry.points}pt</TableCell>
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
