import { createHash } from "node:crypto";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";
import type { ChatRequest } from "./openai/typing";

export type ReplayMode = "off" | "record" | "replay";

type ReplayRequest = {
  model: string;
  messages: ChatRequest["messages"];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  presence_penalty?: number;
};

export type ReplayPayload = {
  content: string;
  reasoning: string;
  events: ReplayEvent[];
};

export type ReplayEvent = {
  type: "content" | "reasoning" | "done";
  text?: string;
  atMs: number;
};

type ReplayRecord = {
  version: 1;
  key: string;
  createdAt: string;
  request: ReplayRequest;
  payload: ReplayPayload;
};

const DEFAULT_REPLAY_FILE = "state/chat-replay.jsonl";

function normalizeMode(value: string | undefined): ReplayMode {
  if (value === "off" || value === "record" || value === "replay") {
    return value;
  }
  return process.env.NODE_ENV === "production" ? "off" : "record";
}

export function getReplayMode(): ReplayMode {
  return normalizeMode(process.env.DEV_CHAT_REPLAY_MODE);
}

export function getReplayFilePath() {
  const file = process.env.DEV_CHAT_REPLAY_FILE?.trim() || DEFAULT_REPLAY_FILE;
  return path.resolve(process.cwd(), file);
}

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

  const key = createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");

  return { key, request };
}

export async function findReplayPayload(key: string) {
  const filePath = getReplayFilePath();
  let content = "";
  try {
    content = await readFile(filePath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }

  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i]) as ReplayRecord;
      if (parsed.key === key && parsed.payload) {
        return parsed.payload;
      }
    } catch {
      // Ignore invalid lines to keep replay resilient.
    }
  }

  return null;
}

export async function appendReplayRecord(
  key: string,
  request: ReplayRequest,
  payload: ReplayPayload,
) {
  const filePath = getReplayFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });

  const record: ReplayRecord = {
    version: 1,
    key,
    createdAt: new Date().toISOString(),
    request,
    payload,
  };

  await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
}
