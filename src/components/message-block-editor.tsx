"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  X,
  Type,
  ImageIcon,
  Video,
  ClipboardList,
  Trash2,
  Upload,
  Loader2,
  GripVertical,
} from "lucide-react";
import type { MessageBlock } from "@/types/blocks";
import { createBlock, MAX_BLOCKS } from "@/types/blocks";

type Props = {
  blocks: MessageBlock[];
  onChange: (blocks: MessageBlock[]) => void;
  surveys?: { id: string; title: string }[];
};

const BLOCK_TYPE_OPTIONS = [
  { type: "text" as const, label: "テキスト", icon: Type },
  { type: "image" as const, label: "写真", icon: ImageIcon },
  { type: "video" as const, label: "動画", icon: Video },
  { type: "survey" as const, label: "アンケート", icon: ClipboardList },
];

export function MessageBlockEditor({ blocks, onChange, surveys = [] }: Props) {
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);

  function addBlock(type: MessageBlock["type"]) {
    if (blocks.length >= MAX_BLOCKS) return;
    const newBlock = createBlock(type);
    onChange([...blocks, newBlock]);
    setShowTypeSelector(false);
  }

  function updateBlock(id: string, updates: Partial<MessageBlock>) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  }

  function removeBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  async function handleFileUpload(blockId: string, file: File) {
    setUploadingBlockId(blockId);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        updateBlock(blockId, {
          url: data.url,
          previewUrl: data.url,
        });
      } else {
        alert(data.error || "アップロードに失敗しました");
      }
    } catch {
      alert("アップロードに失敗しました");
    } finally {
      setUploadingBlockId(null);
    }
  }

  function triggerFileUpload(blockId: string) {
    setPendingBlockId(blockId);
    if (fileInputRef.current) {
      const block = blocks.find((b) => b.id === blockId);
      fileInputRef.current.accept =
        block?.type === "video" ? "video/mp4,video/quicktime" : "image/jpeg,image/png,image/webp";
      fileInputRef.current.click();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && pendingBlockId) {
      handleFileUpload(pendingBlockId, file);
    }
    e.target.value = "";
    setPendingBlockId(null);
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />

      {blocks.map((block, index) => (
        <div key={block.id} className="relative group">
          <div className="flex items-start gap-2">
            {/* ブロック番号 */}
            <div className="flex flex-col items-center gap-1 pt-3">
              <div className="rounded-full bg-[#06C755] text-white w-6 h-6 flex items-center justify-center text-xs font-bold">
                {index + 1}
              </div>
              {index < blocks.length - 1 && (
                <div className="w-px h-full min-h-[20px] bg-muted-foreground/20" />
              )}
            </div>

            {/* ブロック本体 */}
            <div className="flex-1 rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  {block.type === "text" && <><Type className="h-3 w-3" /> テキスト</>}
                  {block.type === "image" && <><ImageIcon className="h-3 w-3" /> 写真</>}
                  {block.type === "video" && <><Video className="h-3 w-3" /> 動画</>}
                  {block.type === "survey" && <><ClipboardList className="h-3 w-3" /> アンケート</>}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeBlock(block.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* テキストブロック */}
              {block.type === "text" && (
                <Textarea
                  placeholder="メッセージを入力..."
                  rows={3}
                  value={block.text || ""}
                  onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                />
              )}

              {/* 画像ブロック */}
              {block.type === "image" && (
                <div>
                  {block.url ? (
                    <div className="relative">
                      <img
                        src={block.url}
                        alt="アップロード画像"
                        className="max-h-[200px] rounded-md object-contain border"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => triggerFileUpload(block.id)}
                      >
                        画像を変更
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="w-full h-[120px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-[#06C755] hover:text-[#06C755] transition-colors"
                      onClick={() => triggerFileUpload(block.id)}
                      disabled={uploadingBlockId === block.id}
                    >
                      {uploadingBlockId === block.id ? (
                        <Loader2 className="h-8 w-8 animate-spin" />
                      ) : (
                        <>
                          <Upload className="h-8 w-8" />
                          <span className="text-sm">クリックして画像をアップロード</span>
                          <span className="text-xs">JPEG / PNG（10MB以下）</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* 動画ブロック */}
              {block.type === "video" && (
                <div>
                  {block.url ? (
                    <div className="relative">
                      <video
                        src={block.url}
                        className="max-h-[200px] rounded-md border"
                        controls
                      />
                      <div className="mt-2 space-y-2">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            サムネイル画像（必須）
                          </label>
                          {block.previewUrl && block.previewUrl !== block.url ? (
                            <div className="flex items-center gap-2">
                              <img
                                src={block.previewUrl}
                                alt="サムネイル"
                                className="h-16 rounded border object-cover"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setPendingBlockId(block.id + "_preview");
                                  if (fileInputRef.current) {
                                    fileInputRef.current.accept = "image/jpeg,image/png";
                                    fileInputRef.current.click();
                                  }
                                }}
                              >
                                変更
                              </Button>
                            </div>
                          ) : (
                            <button
                              className="w-full h-[60px] border-2 border-dashed rounded-lg flex items-center justify-center gap-2 text-sm text-muted-foreground hover:border-[#06C755] transition-colors"
                              onClick={() => {
                                setPendingBlockId(block.id + "_preview");
                                if (fileInputRef.current) {
                                  fileInputRef.current.accept = "image/jpeg,image/png";
                                  fileInputRef.current.click();
                                }
                              }}
                            >
                              <Upload className="h-4 w-4" />
                              サムネイル画像をアップロード
                            </button>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerFileUpload(block.id)}
                        >
                          動画を変更
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="w-full h-[120px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-[#06C755] hover:text-[#06C755] transition-colors"
                      onClick={() => triggerFileUpload(block.id)}
                      disabled={uploadingBlockId === block.id}
                    >
                      {uploadingBlockId === block.id ? (
                        <Loader2 className="h-8 w-8 animate-spin" />
                      ) : (
                        <>
                          <Upload className="h-8 w-8" />
                          <span className="text-sm">クリックして動画をアップロード</span>
                          <span className="text-xs">MP4（200MB以下）</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* アンケートブロック */}
              {block.type === "survey" && (
                <div>
                  {surveys.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      アンケートがまだありません。先にアンケートを作成してください。
                    </p>
                  ) : (
                    <select
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={block.surveyId || ""}
                      onChange={(e) => updateBlock(block.id, { surveyId: e.target.value })}
                    >
                      <option value="">アンケートを選択...</option>
                      {surveys.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* ブロック追加ボタン */}
      {blocks.length < MAX_BLOCKS && (
        <div className="relative">
          {blocks.length > 0 && (
            <div className="flex items-center gap-2 ml-3 mb-2">
              <div className="w-px h-4 bg-muted-foreground/20" />
            </div>
          )}
          <button
            onClick={() => setShowTypeSelector(!showTypeSelector)}
            className="w-full h-[56px] border-2 border-dashed border-[#06C755]/40 rounded-lg flex items-center justify-center gap-2 text-[#06C755] hover:bg-[#06C755]/5 transition-colors"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-medium">追加</span>
          </button>

          {/* タイプ選択モーダル */}
          {showTypeSelector && (
            <div className="absolute top-full left-0 right-0 mt-2 z-20">
              <Card className="shadow-lg border-2">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">メッセージの種類を選択</span>
                    <button onClick={() => setShowTypeSelector(false)}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {BLOCK_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.type}
                        onClick={() => addBlock(opt.type)}
                        className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-muted transition-colors text-left"
                      >
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <opt.icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {blocks.length >= MAX_BLOCKS && (
        <p className="text-xs text-muted-foreground text-center">
          最大{MAX_BLOCKS}ブロックまで追加できます
        </p>
      )}
    </div>
  );
}
