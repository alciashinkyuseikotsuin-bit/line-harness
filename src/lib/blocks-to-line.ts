import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageBlock } from "@/types/blocks";
import { buildSurveyFlexMessage } from "@/lib/line";

/**
 * MessageBlock[] を LINE Messaging API のメッセージ配列に変換する。
 *
 * survey ブロックは DB から該当アンケートの最初の質問と選択肢を取得して
 * Flex Message に展開する（非同期）。テキスト・画像・動画は同期的に変換。
 *
 * 既存の同期版 blocksToLineMessages (lib/line.ts) は survey 型を無視するため、
 * アンケートを含む配信ではこちらを使うこと。
 */
export async function blocksToLineMessagesAsync(
  blocks: MessageBlock[],
  supabase: SupabaseClient
): Promise<unknown[]> {
  const messages: unknown[] = [];

  for (const block of blocks) {
    if (block.type === "text") {
      if (block.text?.trim()) {
        messages.push({ type: "text", text: block.text });
      }
      continue;
    }

    if (block.type === "image") {
      if (block.url) {
        messages.push({
          type: "image",
          originalContentUrl: block.url,
          previewImageUrl: block.previewUrl || block.url,
        });
      }
      continue;
    }

    if (block.type === "video") {
      if (block.url && block.previewUrl) {
        messages.push({
          type: "video",
          originalContentUrl: block.url,
          previewImageUrl: block.previewUrl,
        });
      }
      continue;
    }

    if (block.type === "survey") {
      if (!block.surveyId) continue;

      const { data: survey } = await supabase
        .from("surveys")
        .select(
          `id,
           survey_questions (
             id,
             question_text,
             sort_order,
             survey_choices ( id, choice_text, sort_order )
           )`
        )
        .eq("id", block.surveyId)
        .single();

      if (!survey) continue;

      const questions = (
        (survey as {
          survey_questions: {
            id: string;
            question_text: string;
            sort_order: number;
            survey_choices: { id: string; choice_text: string; sort_order: number }[];
          }[];
        }).survey_questions || []
      )
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);

      const firstQ = questions[0];
      if (!firstQ) continue;

      const choices = (firstQ.survey_choices || [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({ id: c.id, text: c.choice_text }));

      messages.push(
        buildSurveyFlexMessage(
          (survey as { id: string }).id,
          firstQ.id,
          firstQ.question_text,
          choices
        )
      );
      continue;
    }
  }

  return messages;
}
