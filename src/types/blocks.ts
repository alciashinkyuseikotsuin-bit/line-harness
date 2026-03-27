export type MessageBlock = {
  id: string;
  type: "text" | "image" | "video" | "survey";
  text?: string;
  url?: string;
  previewUrl?: string;
  surveyId?: string;
};

export function createBlock(type: MessageBlock["type"]): MessageBlock {
  return {
    id: crypto.randomUUID(),
    type,
    text: type === "text" ? "" : undefined,
    url: type === "image" || type === "video" ? "" : undefined,
  };
}

export const MAX_BLOCKS = 5;
