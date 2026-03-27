"use client";

import { Battery, Signal, Wifi } from "lucide-react";

type LinePreviewProps = {
  messages: string[];
  accountName?: string;
};

export function LinePreview({
  messages,
  accountName = "堀優介",
}: LinePreviewProps) {
  const now = new Date();
  const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;

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
            {messages.filter((m) => m.trim()).length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-white/60 text-xs text-center">
                  メッセージを入力すると
                  <br />
                  ここにプレビューが表示されます
                </p>
              </div>
            ) : (
              messages
                .filter((m) => m.trim())
                .map((msg, i) => (
                  <div key={i} className="flex gap-2 items-end">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center text-[10px] font-bold text-gray-600 shrink-0">
                      {accountName.charAt(0)}
                    </div>
                    {/* Bubble */}
                    <div className="flex flex-col gap-1 max-w-[200px]">
                      <div className="relative bg-white rounded-xl rounded-bl-sm px-3 py-2 text-[13px] leading-[1.5] text-gray-800 whitespace-pre-wrap break-words shadow-sm">
                        {msg}
                      </div>
                      {i === messages.filter((m) => m.trim()).length - 1 && (
                        <span className="text-[10px] text-white/70 ml-1">
                          {timeStr}
                        </span>
                      )}
                    </div>
                  </div>
                ))
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
            <div className="w-8 h-8 rounded-full flex items-center justify-center">
              <svg
                className="h-5 w-5 text-gray-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
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
