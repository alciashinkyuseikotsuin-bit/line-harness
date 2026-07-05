// 顧客カルテ用ステージ定義
export const STAGES = [
  "新規",
  "興味あり",
  "教育中",
  "見込み",
  "商談中",
  "顧客",
  "VIP",
  "休眠",
] as const;

export type Stage = (typeof STAGES)[number];

// バッジ色（Tailwindユーティリティ）
export const STAGE_COLORS: Record<string, string> = {
  新規: "bg-gray-100 text-gray-600",
  興味あり: "bg-sky-100 text-sky-700",
  教育中: "bg-indigo-100 text-indigo-700",
  見込み: "bg-purple-100 text-purple-700",
  商談中: "bg-orange-100 text-orange-700",
  顧客: "bg-green-100 text-green-700",
  VIP: "bg-yellow-100 text-yellow-800",
  休眠: "bg-gray-200 text-gray-500",
};

export function stageColor(stage: string | null | undefined): string {
  if (!stage) return "bg-gray-100 text-gray-600";
  return STAGE_COLORS[stage] || "bg-gray-100 text-gray-600";
}
