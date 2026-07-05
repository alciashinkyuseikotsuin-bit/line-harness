"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { SurveyPreview } from "@/components/survey-preview";

type Choice = {
  id: string;
  text: string;
  tag: string;
  broadcastMessage: string;
  isFreeInput?: boolean;
  // 診断タイプ別の加点。キーは DiagnosisType.id（UI管理用ローカルID）
  diagnosisPoints?: Record<string, number>;
};

type Question = {
  id: string;
  text: string;
  type: "single" | "multiple";
  choices: Choice[];
};

// 診断コンテンツのタイプ定義（例：攻め型／守り型／バランス型）
type DiagnosisType = {
  id: string; // UI管理用ローカルID（typeKey とは独立。保存時に typeKey へ変換される）
  typeKey: string; // DB保存キー（diagnosis_results.type_key と一致させる）
  title: string;
  resultMessage: string;
  addTag: string;
};

function makeDiagnosisType(label: string): DiagnosisType {
  return {
    id: `dt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    typeKey: label,
    title: label,
    resultMessage: "",
    addTag: "",
  };
}

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
  // useSearchParams を使うため Suspense でラップ（Next.js の SSR/static generation 制約対応）
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">読み込み中...</p>}>
      <SurveyCreateInner />
    </Suspense>
  );
}

function SurveyCreateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEditMode = !!editId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [completionMessage, setCompletionMessage] = useState("");
  const [surveyType, setSurveyType] = useState<"survey" | "diagnosis">("survey");
  const [diagnosisTypes, setDiagnosisTypes] = useState<DiagnosisType[]>([]);
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
  const [savedSurveyId, setSavedSurveyId] = useState<string | null>(editId);
  const [loadingEdit, setLoadingEdit] = useState(isEditMode);

  // 編集モード: 既存データを読み込む
  useEffect(() => {
    if (!editId) return;
    fetch(`/api/surveys/${editId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.survey) {
          setTitle(d.survey.title || "");
          setDescription(d.survey.description || "");
          setCompletionMessage(d.survey.completionMessage || "");

          const loadedType: "survey" | "diagnosis" =
            d.survey.surveyType === "diagnosis" ? "diagnosis" : "survey";
          setSurveyType(loadedType);

          // 診断タイプ定義を読み込み、typeKey → ローカルID の対応を作る
          let loadedTypes: DiagnosisType[] = [];
          if (
            loadedType === "diagnosis" &&
            Array.isArray(d.survey.diagnosisResults)
          ) {
            loadedTypes = d.survey.diagnosisResults.map(
              (r: {
                typeKey: string;
                title: string;
                resultMessage: string;
                addTag: string;
              }) => ({
                id: `dt_${r.typeKey}`,
                typeKey: r.typeKey,
                title: r.title || "",
                resultMessage: r.resultMessage || "",
                addTag: r.addTag || "",
              })
            );
            setDiagnosisTypes(loadedTypes);
          }

          if (d.survey.questions && d.survey.questions.length > 0) {
            const qs = (d.survey.questions as Question[]).map((q) => ({
              ...q,
              choices: q.choices.map((c) => {
                const serverPoints =
                  (c as Choice).diagnosisPoints || ({} as Record<string, number>);
                const localPoints: Record<string, number> = {};
                for (const t of loadedTypes) {
                  const v = serverPoints[t.typeKey];
                  if (v) localPoints[t.id] = v;
                }
                return { ...c, diagnosisPoints: localPoints };
              }),
            }));
            setQuestions(qs);
          }
        }
      })
      .catch((err) => {
        console.error("アンケート読み込み失敗:", err);
      })
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  function applyTemplate(key: string) {
    const t = TEMPLATES[key];
    if (!t) return;
    setTitle(t.title);
    setDescription(t.description);
    setQuestions(t.questions);
    setSurveyType("survey");
    setDiagnosisTypes([]);
  }

  // アンケート ⇔ 診断 の種別切替
  function switchSurveyType(next: "survey" | "diagnosis") {
    setSurveyType(next);
    if (next === "diagnosis") {
      setDiagnosisTypes((prev) =>
        prev.length > 0 ? prev : [makeDiagnosisType("タイプA"), makeDiagnosisType("タイプB")]
      );
    }
  }

  function addDiagnosisType() {
    setDiagnosisTypes((prev) => [
      ...prev,
      makeDiagnosisType(`タイプ${prev.length + 1}`),
    ]);
  }

  function removeDiagnosisType(typeId: string) {
    setDiagnosisTypes((prev) => prev.filter((t) => t.id !== typeId));
    // 各選択肢に残っている当該タイプの加点データも削除
    setQuestions((prev) =>
      prev.map((q) => ({
        ...q,
        choices: q.choices.map((c) => {
          if (!c.diagnosisPoints || !(typeId in c.diagnosisPoints)) return c;
          const rest = { ...c.diagnosisPoints };
          delete rest[typeId];
          return { ...c, diagnosisPoints: rest };
        }),
      }))
    );
  }

  function updateDiagnosisType(
    typeId: string,
    field: "typeKey" | "title" | "resultMessage" | "addTag",
    value: string
  ) {
    setDiagnosisTypes((prev) =>
      prev.map((t) => (t.id === typeId ? { ...t, [field]: value } : t))
    );
  }

  function updateChoiceDiagnosisPoint(
    qId: string,
    cId: string,
    typeId: string,
    value: number
  ) {
    const clamped = Math.max(0, Math.min(3, Number.isFinite(value) ? value : 0));
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId
          ? {
              ...q,
              choices: q.choices.map((c) =>
                c.id === cId
                  ? {
                      ...c,
                      diagnosisPoints: {
                        ...(c.diagnosisPoints || {}),
                        [typeId]: clamped,
                      },
                    }
                  : c
              ),
            }
          : q
      )
    );
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

  // 保存前の入力チェック（アンケート・診断共通 + 診断固有）
  function validateBeforeSave(): boolean {
    if (!title.trim()) {
      alert("アンケート名を入力してください");
      return false;
    }
    if (questions.some((q) => !q.text.trim())) {
      alert("質問文を入力してください");
      return false;
    }
    if (surveyType === "diagnosis") {
      if (diagnosisTypes.length === 0) {
        alert("診断タイプを1つ以上追加してください");
        return false;
      }
      if (diagnosisTypes.some((t) => !t.typeKey.trim() || !t.title.trim())) {
        alert("診断タイプの識別子とタイトルをすべて入力してください");
        return false;
      }
    }
    return true;
  }

  // API送信用のペイロードを組み立てる（診断タイプ別加点をローカルID→typeKeyへ変換）
  function buildPayload() {
    const diagnosisResultsPayload = diagnosisTypes.map((t, i) => ({
      typeKey: t.typeKey.trim(),
      title: t.title.trim(),
      resultMessage: t.resultMessage,
      addTag: t.addTag.trim() || null,
      sortOrder: i,
    }));

    const questionsPayload = questions.map((q) => ({
      ...q,
      choices: q.choices.map((c) => {
        const diagnosisPoints: Record<string, number> = {};
        if (surveyType === "diagnosis") {
          for (const t of diagnosisTypes) {
            const key = t.typeKey.trim();
            if (!key) continue;
            const v = Number(c.diagnosisPoints?.[t.id] || 0);
            if (v) diagnosisPoints[key] = v;
          }
        }
        return { ...c, diagnosisPoints };
      }),
    }));

    return {
      title,
      description,
      completionMessage,
      surveyType,
      questions: questionsPayload,
      diagnosisResults: surveyType === "diagnosis" ? diagnosisResultsPayload : [],
    };
  }

  // 下書き保存（編集モードならPATCH、新規ならPOST）
  async function saveDraft() {
    if (!validateBeforeSave()) return;

    setSaving(true);
    try {
      const url = editId ? `/api/surveys/${editId}` : "/api/surveys";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "保存に失敗しました");
        return;
      }

      setSavedSurveyId(editId || data.survey?.id || null);
      router.push("/survey");
    } catch {
      alert("エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  // テスト配信（堀優介のみ）
  async function sendTest() {
    if (!validateBeforeSave()) return;

    setSending(true);
    setTestResult(null);
    try {
      // まず保存（編集モードならPATCH、新規ならPOST）
      const url = editId ? `/api/surveys/${editId}` : "/api/surveys";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "保存に失敗しました");
        return;
      }

      const surveyId = editId || data.survey?.id;
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/survey">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">
          {isEditMode ? "アンケート編集" : "アンケート作成"}
        </h1>
        {loadingEdit && (
          <span className="text-xs text-muted-foreground">読み込み中...</span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-6 min-w-0">
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

      {/* 種別切替 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">種別</p>
          </div>
          <div className="inline-flex rounded-lg border p-1 bg-muted/30">
            <Button
              type="button"
              size="sm"
              variant={surveyType === "survey" ? "default" : "ghost"}
              className={surveyType === "survey" ? "bg-[#06C755] hover:bg-[#05b34c]" : ""}
              onClick={() => switchSurveyType("survey")}
            >
              アンケート
            </Button>
            <Button
              type="button"
              size="sm"
              variant={surveyType === "diagnosis" ? "default" : "ghost"}
              className={surveyType === "diagnosis" ? "bg-purple-600 hover:bg-purple-700" : ""}
              onClick={() => switchSurveyType("diagnosis")}
            >
              診断
            </Button>
          </div>
          {surveyType === "diagnosis" && (
            <p className="text-xs text-muted-foreground mt-2">
              診断コンテンツ：質問の選択肢ごとにタイプ別の加点を設定し、合計点が最も高いタイプの結果をLINEで自動送信します。
            </p>
          )}
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
          <div className="space-y-2">
            <label className="text-sm font-medium">
              全質問回答完了時のメッセージ（任意）
            </label>
            <Textarea
              value={completionMessage}
              onChange={(e) => setCompletionMessage(e.target.value)}
              placeholder="例：アンケートに答えていただきありがとうございます😊"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              最後の質問に回答した瞬間に、このメッセージが自動送信されます。
              空のままだと何も送られません。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 診断タイプ定義（診断コンテンツの場合のみ） */}
      {surveyType === "diagnosis" && (
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">診断タイプ定義</CardTitle>
              <Badge variant="outline">{diagnosisTypes.length}タイプ</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              例：攻め型／守り型／バランス型。各質問の選択肢に、ここで定義したタイプごとの加点を設定します。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {diagnosisTypes.map((t, ti) => (
              <div
                key={t.id}
                className="rounded-lg border p-4 space-y-3 bg-purple-50/40 dark:bg-purple-950/10"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">
                    タイプ {ti + 1}
                  </Badge>
                  {diagnosisTypes.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeDiagnosisType(t.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      タイプ識別子（type_key）
                    </label>
                    <Input
                      value={t.typeKey}
                      onChange={(e) =>
                        updateDiagnosisType(t.id, "typeKey", e.target.value)
                      }
                      placeholder="例：攻め型"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      付与タグ（任意）
                    </label>
                    <Input
                      value={t.addTag}
                      onChange={(e) =>
                        updateDiagnosisType(t.id, "addTag", e.target.value)
                      }
                      placeholder="例：攻め型"
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    結果タイトル
                  </label>
                  <Input
                    value={t.title}
                    onChange={(e) =>
                      updateDiagnosisType(t.id, "title", e.target.value)
                    }
                    placeholder="例：攻め型経営者タイプ"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    結果メッセージ（LINEに送信される本文）
                  </label>
                  <Textarea
                    value={t.resultMessage}
                    onChange={(e) =>
                      updateDiagnosisType(t.id, "resultMessage", e.target.value)
                    }
                    placeholder="例：あなたは新しい施策にどんどん挑戦していく攻め型です..."
                    rows={3}
                    className="text-sm"
                  />
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addDiagnosisType}>
              <Plus className="h-3 w-3 mr-1" />
              タイプを追加
            </Button>
          </CardContent>
        </Card>
      )}

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

                    {surveyType === "diagnosis" && diagnosisTypes.length > 0 && (
                      <div className="space-y-1.5 border-t pt-3">
                        <label className="text-xs text-muted-foreground">
                          タイプ別加点（0〜3点）
                        </label>
                        <div className="flex flex-wrap gap-3">
                          {diagnosisTypes.map((t) => (
                            <div key={t.id} className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {t.title || t.typeKey || "（未設定）"}
                              </span>
                              <Input
                                type="number"
                                min={0}
                                max={3}
                                step={1}
                                value={c.diagnosisPoints?.[t.id] ?? 0}
                                onChange={(e) =>
                                  updateChoiceDiagnosisPoint(
                                    q.id,
                                    c.id,
                                    t.id,
                                    Number(e.target.value)
                                  )
                                }
                                className="h-7 w-16 text-sm text-center"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
          disabled={saving || sending}
        >
          {sending && !showAllConfirm && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Send className="h-4 w-4 mr-2" />
          {savedSurveyId ? "もう一度テスト配信" : "テスト配信（堀優介のみ）"}
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
        {/* プレビュー（PC幅でのみ右側固定表示） */}
        <div className="hidden xl:block">
          <div className="sticky top-6">
            <SurveyPreview title={title} questions={questions} />
          </div>
        </div>
      </div>
    </div>
  );
}
