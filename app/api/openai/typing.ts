import type { CreateChatCompletionResponse } from "openai";

type MessageTextPart = { type: "text"; text: string };
type MessageImagePart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<MessageTextPart | MessageImagePart>;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  presence_penalty?: number;
  reasoning?: {
    effort?: "low" | "medium" | "high";
  };
};
export type ChatReponse = CreateChatCompletionResponse;
