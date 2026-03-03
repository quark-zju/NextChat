import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReplayPayload, ReplayRequest } from "./replay-shared";

type ReplayRecord = {
  version: 1;
  key: string;
  createdAt: string;
  request: ReplayRequest;
  payload: ReplayPayload;
};

const DEFAULT_REPLAY_DIR = "state/chat-replay";

function getReplayDirPath() {
  const dir = process.env.DEV_CHAT_REPLAY_DIR?.trim() || DEFAULT_REPLAY_DIR;
  return path.resolve(process.cwd(), dir);
}

function getReplayFilePath(key: string) {
  return path.join(getReplayDirPath(), `${key}.json`);
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
