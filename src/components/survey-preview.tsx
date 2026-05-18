"use client";

import { Battery, Signal, Wifi, ClipboardList } from "lucide-react";

type PreviewChoice = {
  id: string;
  text: string;
  isFreeInput?: boolean;
};

type PreviewQuestion = {
  id: string;
  text: string;
  choices: PreviewChoice[];
};

type SurveyPreviewProps = {
  title?: string;
  questions: PreviewQuestion[];
  accountName?: string;
};

// LINE Flex Message (アンケートカード) を再現するプレビュー。
// 実送信時の見た目 (src/lib/line.ts の sendSurveyMessage) と合わせて表示する。
export function SurveyPreview({
  title,
  questions,
  accountName = "堀優介",
}: SurveyPreviewProps) {
  const now = new Date();
  const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;

  const visibleQuestions = questions.filter((q) => q.text?.trim());

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs text-muted-foreground mb-2">スマホプレビュー</p>
      {/* Phone frame */}
      <div className="relative w-[320px] h-[568px] rounded-[40px] border-[3px] border-gray-800 bg-gray-800 shadow-xl overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-gray-800 rounded-b-2xl z-20" />

        {/* Screen */}
        <div className="w-full h-full rounded-[37px] overflow-hidden bg-white flex flex-col">
          {/* Status bar */}
          <div className="h-[44px] bg-[#06C755] flex items-end justify-between px-6 pb-1 pt-2">
            <span className="text-white text-[10px] font-semibold">{timeStr}</span>
            <div className="flex items-center gap-1">
              <Signal className="h-3 w-3 text-white" />
              <Wifi className="h-3 w-3 text-white" />
              <Battery className="h-3 w-3 text-white" />
            </div>
          </div>

          {/* LINE header */}
          <div className="h-[48px] bg-[#06C755] flex items-center px-4 gap-3">
            <svg
              className="h-5 w-5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <div className="flex items-center gap-2 flex-1">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                {accountName.charAt(0)}
              </div>
              <span className="text-white font-bold text-sm">{accountName}</span>
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 bg-[#7494C0] p-3 overflow-y-auto space-y-3">
            {visibleQuestions.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-white/70 text-xs text-center px-4">
                  質問を入力すると
                  <br />
                  ここにプレビューが表示されます
                </p>
              </div>
            ) : (
              <>
                {title?.trim() && (
                  <div className="flex gap-2 items-end">
                    <div className="w-8 h-8 rounded-full bg-white/80 shrink-0 flex items-center justify-center text-[10px] font-bold text-gray-600">
                      {accountName.charAt(0)}
                    </div>
                    <div className="bg-white rounded-xl rounded-bl-sm px-3 py-2 text-[13px] text-gray-800 max-w-[210px] shadow-sm">
                      アンケートにご協力ください{title ? `\n（${title}）` : ""}
                    </div>
                  </div>
                )}
                {visibleQuestions.map((q, qi) => (
                  <div key={q.id} className="flex gap-2 items-end">
                    <div
                      className={`w-8 h-8 rounded-full shrink-0 ${
                        qi === 0 && !title?.trim()
                          ? "bg-white/80 flex items-center justify-center text-[10px] font-bold text-gray-600"
                          : ""
                      }`}
                    >
                      {qi === 0 && !title?.trim() && accountName.charAt(0)}
                    </div>
                    <div className="bg-white rounded-xl overflow-hidden shadow-sm max-w-[230px]">
                      {/* Header */}
                      <div className="bg-[#06C755]/10 px-3 py-1.5 flex items-center gap-1">
                        <ClipboardList className="h-3 w-3 text-[#06C755]" />
                        <span className="text-[10px] font-bold text-[#06C755]">
                          アンケート Q{qi + 1}
                        </span>
                      </div>
                      {/* Body */}
                      <div className="px-3 py-2 border-b">
                        <p className="text-[13px] font-bold text-gray-800 leading-snug break-words">
                          {q.text}
                        </p>
                      </div>
                      {/* Footer: choices */}
                      <div className="px-3 py-2 space-y-1.5">
                        {q.choices.filter((c) => c.text?.trim()).length === 0 ? (
                          <p className="text-[10px] text-gray-400 text-center py-1">
                            選択肢を入力してください
                          </p>
                        ) : (
                          q.choices
                            .filter((c) => c.text?.trim())
                            .map((c) => (
                              <button
                                key={c.id}
                                disabled
                                className="w-full rounded-md bg-[#06C755] text-white text-[12px] font-medium py-1.5 px-2 truncate text-left cursor-default"
                              >
                                {c.text}
                                {c.isFreeInput && (
                                  <span className="text-[9px] ml-1 opacity-80">
                                    (自由記入)
                                  </span>
                                )}
                              </button>
                            ))
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end">
                  <span className="text-[10px] text-white/70 mr-1">{timeStr}</span>
                </div>
              </>
            )}
          </div>

          {/* Bottom input bar */}
          <div className="h-[50px] bg-[#EFF0F2] flex items-center px-3 gap-2">
            <div className="w-8 h-8 rounded-full bg-[#06C755] flex items-center justify-center">
              <svg
                className="h-4 w-4 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <div className="flex-1 h-8 rounded-full bg-white border border-gray-300 px-3 flex items-center">
              <span className="text-gray-400 text-xs">Aa</span>
            </div>
          </div>

          {/* Home indicator */}
          <div className="h-[20px] bg-[#EFF0F2] flex items-center justify-center">
            <div className="w-[100px] h-[4px] rounded-full bg-gray-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
