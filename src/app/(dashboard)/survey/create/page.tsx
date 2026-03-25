"use client";

import { useState } from "react";
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
} from "lucide-react";
import Link from "next/link";

type Choice = {
  id: string;
  text: string;
  tag: string;
  broadcastMessage: string;
};

type Question = {
  id: string;
  text: string;
  type: "single" | "multiple";
  choices: Choice[];
};

const initialQuestions: Question[] = [
  {
    id: "q1",
    text: "どのメニューに興味がありますか？",
    type: "single",
    choices: [
      {
        id: "c1",
        text: "カット",
        tag: "カット希望",
        broadcastMessage: "カットメニューのご案内をお送りします",
      },
      {
        id: "c2",
        text: "カラー",
        tag: "カラー希望",
        broadcastMessage: "カラーメニューのご案内をお送りします",
      },
      {
        id: "c3",
        text: "トリートメント",
        tag: "トリートメント希望",
        broadcastMessage: "トリートメントメニューのご案内をお送りします",
      },
    ],
  },
];

export default function SurveyCreatePage() {
  const [title, setTitle] = useState("新規アンケート");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);

  function addQuestion() {
    const newId = `q${Date.now()}`;
    setQuestions([
      ...questions,
      {
        id: newId,
        text: "",
        type: "single",
        choices: [
          {
            id: `c${Date.now()}a`,
            text: "",
            tag: "",
            broadcastMessage: "",
          },
          {
            id: `c${Date.now()}b`,
            text: "",
            tag: "",
            broadcastMessage: "",
          },
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
    setQuestions(
      questions.map((q) => (q.id === qId ? { ...q, text } : q))
    );
  }

  function updateChoice(
    qId: string,
    cId: string,
    field: keyof Choice,
    value: string
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
              placeholder="例：初回カウンセリングアンケート"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">説明文</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="アンケートの説明を入力（LINEで表示されます）"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">質問一覧</h2>
          <Badge variant="outline">{questions.length}問</Badge>
        </div>

        {questions.map((q, qi) => (
          <Card key={q.id}>
            <CardHeader className="flex flex-row items-start justify-between pb-3">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <Badge variant="secondary">Q{qi + 1}</Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeQuestion(q.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
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
                  選択肢 → セグメント → 配信メッセージ
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
                          placeholder="例：カット"
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
                          placeholder="例：カット希望"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Send className="h-3 w-3" />
                          配信メッセージ
                        </label>
                        <Input
                          value={c.broadcastMessage}
                          onChange={(e) =>
                            updateChoice(
                              q.id,
                              c.id,
                              "broadcastMessage",
                              e.target.value
                            )
                          }
                          placeholder="この選択肢を選んだ人への配信内容"
                          className="text-sm"
                        />
                      </div>
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

      <div className="flex gap-3 justify-end">
        <Button variant="outline">下書き保存</Button>
        <Button className="bg-[#06C755] hover:bg-[#05b34c]">
          <Send className="h-4 w-4 mr-2" />
          LINE で配信する
        </Button>
      </div>
    </div>
  );
}
