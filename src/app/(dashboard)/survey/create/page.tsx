"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  GripVertical,
  ArrowLeft,
  Send,
  Tag,
  Loader2,
  FileText,
} from "lucide-react";
import Link from "next/link";

type Choice = {
  id: string;
  text: string;
  tag: string;
  broadcastMessage: string;
  isFreeInput?: boolean;
};

type Question = {
  id: string;
  text: string;
  type: "single" | "multiple";
  choices: Choice[];
};

// プリセットテンプレート
const TEMPLATES: Record<string, { title: string; description: string; questions: Question[] }> = {
  consultation: {
    title: "コンサル初回アンケート",
    description: "売上目標と業種を把握するためのアンケートです",
    questions: [
      {
        id: "q_revenue",
        text: "目標の売上を教えてください",
        type: "single",
        choices: [
          { id: "c_50", text: "〜50万", tag: "50万", broadcastMessage: "", isFreeInput: false },
          { id: "c_100", text: "50万〜100万", tag: "100万", broadcastMessage: "", isFreeInput: false },
          { id: "c_200", text: "100万〜200万", tag: "200万", broadcastMessage: "", isFreeInput: false },
          { id: "c_300", text: "200万〜300万", tag: "300万", broadcastMessage: "", isFreeInput: false },
        ],
      },
      {
        id: "q_industry",
        text: "あなたの業種を教えてください",
        type: "single",
        choices: [
          { id: "c_sekkotsu", text: "接骨院・鍼灸院", tag: "接骨院・鍼灸院", broadcastMessage: "", isFreeInput: false },
          { id: "c_seitai", text: "整体院・カイロ", tag: "整体院", broadcastMessage: "", isFreeInput: false },
          { id: "c_esthe", text: "エステ", tag: "エステ", broadcastMessage: "", isFreeInput: false },
          { id: "c_relax", text: "リラクゼーション", tag: "リラク", broadcastMessage: "", isFreeInput: false },
          { id: "c_gym", text: "パーソナルジム", tag: "パーソナルジム", broadcastMessage: "", isFreeInput: false },
          { id: "c_other", text: "その他（入力）", tag: "業種:その他", broadcastMessage: "業種を教えてください（例：ヨガスタジオ、ピラティス等）", isFreeInput: true },
        ],
      },
    ],
  },
};

export default function SurveyCreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: "q1",
      text: "",
      type: "single",
      choices: [
        { id: "c1a", text: "", tag: "", broadcastMessage: "" },
        { id: "c1b", text: "", tag: "", broadcastMessage: "" },
      ],
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showAllConfirm, setShowAllConfirm] = useState(false);
  const [savedSurveyId, setSavedSurveyId] = useState<string | null>(null);

  function applyTemplate(key: string) {
    const t = TEMPLATES[key];
    if (!t) return;
    setTitle(t.title);
    setDescription(t.description);
    setQuestions(t.questions);
  }

  function addQuestion() {
    const newId = `q${Date.now()}`;
    setQuestions([
      ...questions,
      {
        id: newId,
        text: "",
        type: "single",
        choices: [
          { id: `c${Date.now()}a`, text: "", tag: "", broadcastMessage: "" },
          { id: `c${Date.now()}b`, text: "", tag: "", broadcastMessage: "" },
        ],
      },
    ]);
  }

  function removeQuestion(qId: string) {
    setQuestions(questions.filter((q) => q.id !== qId));
  }

  function addChoice(qId: string) {
    setQuestions(
      questions.map((q) =>
        q.id === qId
          ? {
              ...q,
              choices: [
                ...q.choices,
                {
                  id: `c${Date.now()}`,
                  text: "",
                  tag: "",
                  broadcastMessage: "",
                },
              ],
            }
          : q
      )
    );
  }

  function removeChoice(qId: string, cId: string) {
    setQuestions(
      questions.map((q) =>
        q.id === qId
          ? { ...q, choices: q.choices.filter((c) => c.id !== cId) }
          : q
      )
    );
  }

  function updateQuestion(qId: string, text: string) {
    setQuestions(questions.map((q) => (q.id === qId ? { ...q, text } : q)));
  }

  function updateChoice(
    qId: string,
    cId: string,
    field: string,
    value: string | boolean
  ) {
    setQuestions(
      questions.map((q) =>
        q.id === qId
          ? {
              ...q,
              choices: q.choices.map((c) =>
                c.id === cId ? { ...c, [field]: value } : c
              ),
            }
          : q
      )
    );
  }

  // 下書き保存のみ
  async function saveDraft() {
    if (!title.trim()) {
      alert("アンケート名を入力してください");
      return;
    }
    if (questions.some((q) => !q.text.trim())) {
      alert("質問文を入力してください");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, questions }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "保存に失敗しました");
        return;
      }

      setSavedSurveyId(data.survey?.id || null);
      router.push("/survey");
    } catch {
      alert("エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  // テスト配信（堀優介のみ）
  async function sendTest() {
    if (!title.trim()) {
      alert("アンケート名を入力してください");
      return;
    }
    if (questions.some((q) => !q.text.trim())) {
      alert("質問文を入力してください");
      return;
    }

    setSending(true);
    setTestResult(null);
    try {
      // まず保存
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, questions }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "保存に失敗しました");
        return;
      }

      const surveyId = data.survey?.id;
      setSavedSurveyId(surveyId);

      if (surveyId) {
        // テストモードで送信（「テスト配信」タグの人だけ）
        const sendRes = await fetch(`/api/surveys/${surveyId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "test" }),
        });
        const sendData = await sendRes.json();
        if (sendRes.ok) {
          setTestResult(
            `✅ テスト配信完了: ${(sendData.sentTo || []).join(", ")} に送信しました（${sendData.sentCount}人）`
          );
        } else {
          setTestResult(`❌ ${sendData.error || "テスト配信に失敗しました"}`);
        }
      }
    } catch {
      setTestResult("❌ エラーが発生しました");
    } finally {
      setSending(false);
    }
  }

  // 本配信（全員） - 二重確認後のみ
  async function sendAll() {
    if (!savedSurveyId) {
      alert("先にテスト配信を行ってください");
      return;
    }

    setSending(true);
    try {
      const sendRes = await fetch(`/api/surveys/${savedSurveyId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
      const sendData = await sendRes.json();
      if (sendRes.ok) {
        alert(`配信完了: ${sendData.sentCount}人に送信しました`);
        router.push("/survey");
      } else {
        alert(sendData.error || "配信に失敗しました");
      }
    } catch {
      alert("エラーが発生しました");
    } finally {
      setSending(false);
      setShowAllConfirm(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/survey">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">アンケート作成</h1>
      </div>

      {/* テンプレート */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">テンプレートから作成</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyTemplate("consultation")}
            >
              コンサル初回アンケート（売上目標 + 業種）
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">アンケート名</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：コンサル初回アンケート"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">説明文</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="アンケートの目的など"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* 質問 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">質問一覧</h2>
          <Badge variant="outline">{questions.length}問</Badge>
        </div>

        {questions.map((q, qi) => (
          <Card key={q.id} className="border-l-4 border-l-[#06C755]">
            <CardHeader className="flex flex-row items-start justify-between pb-3">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <Badge variant="secondary">Q{qi + 1}</Badge>
              </div>
              {questions.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeQuestion(q.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={q.text}
                onChange={(e) => updateQuestion(q.id, e.target.value)}
                placeholder="質問文を入力"
                className="font-medium"
              />

              <Separator />

              <div className="space-y-3">
                <div className="text-sm font-medium text-muted-foreground">
                  選択肢 → タグ → 自動返信
                </div>

                {q.choices.map((c, ci) => (
                  <div
                    key={c.id}
                    className="rounded-lg border p-4 space-y-3 bg-muted/30"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        選択肢 {ci + 1}
                      </Badge>
                      <div className="flex items-center gap-2">
                        {c.isFreeInput && (
                          <Badge className="text-xs bg-orange-100 text-orange-700">
                            自由記入
                          </Badge>
                        )}
                        {q.choices.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeChoice(q.id, c.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          選択肢テキスト
                        </label>
                        <Input
                          value={c.text}
                          onChange={(e) =>
                            updateChoice(q.id, c.id, "text", e.target.value)
                          }
                          placeholder="例：接骨院・鍼灸院"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          自動付与タグ
                        </label>
                        <Input
                          value={c.tag}
                          onChange={(e) =>
                            updateChoice(q.id, c.id, "tag", e.target.value)
                          }
                          placeholder="例：接骨院・鍼灸院"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Send className="h-3 w-3" />
                          {c.isFreeInput ? "入力を求めるメッセージ" : "自動返信（任意）"}
                        </label>
                        <Input
                          value={c.broadcastMessage}
                          onChange={(e) =>
                            updateChoice(q.id, c.id, "broadcastMessage", e.target.value)
                          }
                          placeholder={c.isFreeInput ? "例：業種を教えてください" : "この選択肢を選んだ人への返信"}
                          className="text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={c.isFreeInput || false}
                          onChange={(e) =>
                            updateChoice(q.id, c.id, "isFreeInput", e.target.checked)
                          }
                          className="rounded"
                        />
                        「その他」自由記入（選択後にテキスト入力を求め、入力内容をタグとして登録）
                      </label>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addChoice(q.id)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  選択肢を追加
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button variant="outline" className="w-full" onClick={addQuestion}>
          <Plus className="h-4 w-4 mr-2" />
          質問を追加
        </Button>
      </div>

      <Separator />

      {/* テスト結果 */}
      {testResult && (
        <div className={`rounded-md px-4 py-3 text-sm ${testResult.startsWith("✅") ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {testResult}
        </div>
      )}

      {/* 本配信確認ダイアログ */}
      {showAllConfirm && (
        <Card className="border-red-400 border-2">
          <CardContent className="pt-6">
            <h3 className="font-bold text-lg text-red-600 mb-3">⚠️ 全友だちに配信しますか？</h3>
            <p className="text-sm text-muted-foreground mb-4">
              この操作は取り消せません。全友だちにアンケートが送信されます。
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowAllConfirm(false)}
              >
                キャンセル
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                disabled={sending}
                onClick={sendAll}
              >
                {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                本当に全員に配信する
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 justify-end">
        <Button
          variant="outline"
          onClick={saveDraft}
          disabled={saving || sending}
        >
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          下書き保存
        </Button>
        <Button
          variant="outline"
          className="border-[#06C755] text-[#06C755] hover:bg-[#06C755]/10"
          onClick={sendTest}
          disabled={saving || sending || !!savedSurveyId}
        >
          {sending && !showAllConfirm && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Send className="h-4 w-4 mr-2" />
          {savedSurveyId ? "テスト配信済み ✓" : "テスト配信（堀優介のみ）"}
        </Button>
        <Button
          className="bg-[#06C755] hover:bg-[#05b34c]"
          onClick={() => {
            if (!savedSurveyId) {
              alert("先にテスト配信を行ってから本配信してください");
              return;
            }
            setShowAllConfirm(true);
          }}
          disabled={saving || sending || !savedSurveyId}
        >
          <Send className="h-4 w-4 mr-2" />
          全員に配信
        </Button>
      </div>
    </div>
  );
}
