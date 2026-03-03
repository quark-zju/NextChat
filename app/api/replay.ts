import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChatRequest } from "./openai/typing";

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

const DEFAULT_REPLAY_DIR = "state/chat-replay";

export function isReplayEnabled() {
  return process.env.NODE_ENV !== "production";
}

function getReplayDirPath() {
  const dir = process.env.DEV_CHAT_REPLAY_DIR?.trim() || DEFAULT_REPLAY_DIR;
  return path.resolve(process.cwd(), dir);
}

function getReplayFilePath(key: string) {
  return path.join(getReplayDirPath(), `${key}.json`);
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

  const keySource = {
    model: request.model,
    messages: request.messages,
  };

  const key = createHash("sha256")
    .update(JSON.stringify(keySource))
    .digest("hex");

  return { key, request };
}

export async function findReplayPayload(key: string) {
  const filePath = getReplayFilePath(key);
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as ReplayRecord;
    if (parsed.key === key && parsed.payload) {
      return parsed.payload;
    }
    return null;
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function saveReplayRecord(
  key: string,
  request: ReplayRequest,
  payload: ReplayPayload,
) {
  const filePath = getReplayFilePath(key);
  await mkdir(path.dirname(filePath), { recursive: true });

  const record: ReplayRecord = {
    version: 1,
    key,
    createdAt: new Date().toISOString(),
    request,
    payload,
  };

  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}
