import type { ChatRequest } from "./openai/typing";

export type ReplayRequest = {
  model: string;
  messages: ChatRequest["messages"];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  presence_penalty?: number;
};

export type ReplayEvent = {
  type: "content" | "reasoning" | "done";
  text?: string;
  atMs: number;
};

export type ReplayPayload = {
  content: string;
  reasoning: string;
  events: ReplayEvent[];
};

function normalizeRequestBody(raw: unknown): ReplayRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.model !== "string" || !Array.isArray(body.messages)) {
    return null;
  }

  return {
    model: body.model,
    messages: body.messages as ChatRequest["messages"],
    temperature:
      typeof body.temperature === "number" ? body.temperature : undefined,
    max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
    max_completion_tokens:
      typeof body.max_completion_tokens === "number"
        ? body.max_completion_tokens
        : undefined,
    presence_penalty:
      typeof body.presence_penalty === "number" ? body.presence_penalty : undefined,
  };
}

export function parseReplayRequest(raw: unknown) {
  const request = normalizeRequestBody(raw);
  if (!request) return null;

  const keySource = {
    model: request.model,
    messages: request.messages,
  };

  const rawKey = JSON.stringify(keySource);
  let hash = 5381;
  for (let i = 0; i < rawKey.length; i += 1) {
    hash = (hash * 33) ^ rawKey.charCodeAt(i);
  }
  const key = (hash >>> 0).toString(16).padStart(8, "0");

  return { key, request };
}

export function isReplayEnabled() {
  return process.env.NODE_ENV !== "production";
}
