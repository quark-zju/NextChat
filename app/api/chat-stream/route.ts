import { createParser } from "eventsource-parser";
import { NextRequest } from "next/server";
import { requestOpenai } from "../common";
import {
  isMostlyEnglish,
  translateReasoning,
  DEFAULT_TARGET_LANGUAGE,
} from "../reasoning-translate/shared";
import {
  isReplayEnabled,
  parseReplayRequest,
  type ReplayEvent,
  type ReplayPayload,
  type ReplayRequest,
} from "../replay-shared";

const SERVER_REASONING_DEBUG = process.env.DEBUG_REASONING_STREAM === "1";

type StreamChunkEvent =
  | { type: "content"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "done" };

function encodeEvent(encoder: TextEncoder, event: StreamChunkEvent) {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTargetLanguage(raw?: string | null) {
  const input = (raw ?? "").trim().toLowerCase();
  if (!input) return DEFAULT_TARGET_LANGUAGE;
  if (input === "cn" || input === "zh" || input.startsWith("zh-")) {
    return "zh-CN";
  }
  if (input === "en" || input.startsWith("en-")) {
    return "en-US";
  }
  return raw?.trim() || DEFAULT_TARGET_LANGUAGE;
}

function parseAcceptLanguage(raw?: string | null) {
  if (!raw) return "";
  const first = raw
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  if (!first) return "";
  return first.split(";")[0]?.trim() ?? "";
}

function resolveTargetLanguage(req: NextRequest) {
  const explicit = req.headers.get("x-chat-lang");
  if (explicit && explicit.trim().length > 0) {
    return normalizeTargetLanguage(explicit);
  }
  return normalizeTargetLanguage(
    parseAcceptLanguage(req.headers.get("accept-language")),
  );
}

function shouldTranslateReasoning(targetLanguage: string) {
  return !targetLanguage.toLowerCase().startsWith("en");
}

function buildTranslationFailureText(targetLanguage: string, source: string) {
  const normalized = source.trim();
  if (normalized.length === 0) {
    return "";
  }

  if (targetLanguage.toLowerCase().startsWith("zh")) {
    return `【思考翻译失败，以下为原文】\n\n${normalized}`;
  }

  return `[Reasoning translation failed. Original text below]\n\n${normalized}`;
}

const LIVE_SEGMENT_MAX_CHARS = 260;

function takeReasoningSegment(buffer: string) {
  const normalized = buffer.replace(/\r\n/g, "\n");
  if (normalized.length === 0) {
    return { segment: "", rest: "" };
  }

  const paragraphMatch = normalized.match(/\n{2,}/);
  if (paragraphMatch && typeof paragraphMatch.index === "number") {
    const splitIndex = paragraphMatch.index;
    const segment = normalized.slice(0, splitIndex).trim();
    const rest = normalized.slice(splitIndex + paragraphMatch[0].length);
    if (segment.length > 0) {
      return { segment, rest };
    }
  }

  if (normalized.length < LIVE_SEGMENT_MAX_CHARS) {
    return { segment: "", rest: normalized };
  }

  const head = normalized.slice(0, LIVE_SEGMENT_MAX_CHARS);
  let splitIndex = Math.max(
    head.lastIndexOf(". "),
    head.lastIndexOf("? "),
    head.lastIndexOf("! "),
    head.lastIndexOf("。"),
    head.lastIndexOf("！"),
    head.lastIndexOf("？"),
  );

  if (splitIndex < 80) {
    splitIndex = LIVE_SEGMENT_MAX_CHARS;
  } else if (splitIndex < head.length) {
    splitIndex += 1;
  }

  const segment = normalized.slice(0, splitIndex).trim();
  const rest = normalized.slice(splitIndex);
  return { segment, rest };
}

function createReplayStream(payload: ReplayPayload) {
  const encoder = new TextEncoder();
  const events =
    Array.isArray(payload.events) && payload.events.length > 0
      ? payload.events
      : [
          ...(payload.reasoning
            ? [{ type: "reasoning", text: payload.reasoning, atMs: 0 }]
            : []),
          ...(payload.content
            ? [{ type: "content", text: payload.content, atMs: 50 }]
            : []),
          { type: "done", atMs: 100 },
        ];

  return new ReadableStream({
    async start(controller) {
      let closed = false;
      let lastAtMs = 0;

      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {}
      };

      for (const rawEvent of events) {
        if (closed) return;
        const event = rawEvent as ReplayEvent;
        const atMs = Math.max(0, Math.floor(event.atMs ?? 0));
        const delayMs = Math.min(5000, Math.max(0, atMs - lastAtMs));
        lastAtMs = atMs;
        if (delayMs > 0) {
          await sleep(delayMs);
        }

        if (event.type === "content") {
          controller.enqueue(
            encodeEvent(encoder, { type: "content", text: event.text ?? "" }),
          );
        } else if (event.type === "reasoning") {
          controller.enqueue(
            encodeEvent(encoder, { type: "reasoning", text: event.text ?? "" }),
          );
        } else if (event.type === "done") {
          controller.enqueue(encodeEvent(encoder, { type: "done" }));
          safeClose();
          return;
        }
      }

      controller.enqueue(encodeEvent(encoder, { type: "done" }));
      safeClose();
    },
  });
}

async function loadReplayPayload(req: NextRequest, key: string) {
  const url = new URL("/api/replay-store", req.nextUrl.origin);
  url.searchParams.set("key", key);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Cache-Control": "no-cache",
    },
  });
  if (!res.ok) {
    throw new Error(`Replay store read failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    ok?: boolean;
    payload?: ReplayPayload | null;
  };
  return json.payload ?? null;
}

async function persistReplayPayload(
  req: NextRequest,
  key: string,
  request: ReplayRequest,
  payload: ReplayPayload,
) {
  const url = new URL("/api/replay-store", req.nextUrl.origin);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify({ key, request, payload }),
  });
  if (!res.ok) {
    throw new Error(`Replay store write failed: ${res.status}`);
  }
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value.replace(/\\n/g, "\n");
  if (Array.isArray(value)) {
    return value.map((item) => extractText(item)).join("");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, any>;
    return [
      record.text,
      record.content,
      record.reasoning,
      record.thinking,
      record.reasoning_content,
      record.reasoningText?.text,
      record.summary,
      record.data?.text,
    ]
      .map((item) => extractText(item))
      .join("");
  }
  return "";
}

function extractDelta(json: Record<string, any>) {
  const delta = json?.choices?.[0]?.delta ?? {};
  let content = "";
  let reasoning = "";
  let hasReasoningInContent = false;

  const rawContent = delta?.content;
  if (Array.isArray(rawContent)) {
    for (const part of rawContent) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      const text = extractText(record.text ?? record.content ?? "");
      const partType = String(record.type ?? "");
      if (
        partType.includes("reasoning") ||
        partType.includes("thinking") ||
        partType.includes("summary")
      ) {
        reasoning += text;
        hasReasoningInContent = true;
      } else {
        content += text;
      }
    }
  } else {
    content += extractText(rawContent);
  }

  const reasoningDirect =
    extractText(delta?.reasoning) ||
    extractText(delta?.thinking) ||
    extractText(delta?.reasoning_content);

  // OpenRouter (e.g. Gemini) may provide both reasoning and reasoning_details
  // in nearby chunks; prefer direct reasoning tokens to avoid duplicated text.
  if (!hasReasoningInContent && reasoningDirect.length > 0) {
    reasoning += reasoningDirect;
  } else if (!hasReasoningInContent) {
    reasoning += extractText(delta?.reasoning_details);
  }

  content = content.replace(/\n{3,}/g, "\n\n");
  reasoning = reasoning.replace(/\n{3,}/g, "\n\n");

  return { content, reasoning };
}

async function createStream(req: NextRequest) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const streamStartedAt = Date.now();
  const traceId = Math.random().toString(36).slice(2, 10);
  const targetLanguage = resolveTargetLanguage(req);
  const translationEnabled = shouldTranslateReasoning(targetLanguage);
  const replayEnabled = isReplayEnabled();
  const replayRequest = await req
    .clone()
    .json()
    .then((body) => parseReplayRequest(body))
    .catch(() => null);
  const replayKey = replayRequest
    ? `${replayRequest.key}:${targetLanguage.toLowerCase()}`
    : "";

  if (replayEnabled && replayRequest) {
    const payload = await loadReplayPayload(req, replayKey);
    if (payload) {
      console.log("[Replay] hit", replayKey);
      return createReplayStream(payload);
    }
    console.log("[Replay] miss", replayKey);
  }

  const res = await requestOpenai(req);

  const contentType = res.headers.get("Content-Type") ?? "";
  if (!contentType.includes("stream")) {
    const content = await (
      await res.text()
    ).replace(/provided:.*. You/, "provided: ***. You");
    console.log("[Stream] error ", content);

    if (replayEnabled && replayRequest) {
      await persistReplayPayload(req, replayKey, replayRequest.request, {
        content: "```json\n" + content + "```",
        reasoning: "",
        events: [
          { type: "content", text: "```json\n" + content + "```", atMs: 0 },
          { type: "done", atMs: 50 },
        ],
      });
    }

    return "```json\n" + content + "```";
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let sawDone = false;
      let eventIndex = 0;
      let contentDeltaCount = 0;
      let reasoningDeltaCount = 0;
      let contentTotalLen = 0;
      let reasoningTotalLen = 0;
      const replayEvents: ReplayEvent[] = [];
      let replayContent = "";
      let replayReasoning = "";
      let reasoningTranslateQueue = Promise.resolve();
      let pendingReasoning = "";
      let emittedReasoningChunkCount = 0;

      const recordReplayEvent = (event: StreamChunkEvent) => {
        const atMs = Date.now() - streamStartedAt;
        if (event.type === "content") {
          replayContent += event.text;
          replayEvents.push({ type: "content", text: event.text, atMs });
        } else if (event.type === "reasoning") {
          replayReasoning += event.text;
          replayEvents.push({ type: "reasoning", text: event.text, atMs });
        } else {
          replayEvents.push({ type: "done", atMs });
        }
      };

      const safeEnqueue = (event: StreamChunkEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(encoder, event));
          if (replayEnabled && replayRequest) {
            recordReplayEvent(event);
          }
        } catch (error) {
          closed = true;
          if (SERVER_REASONING_DEBUG) {
            console.warn("[Reasoning Debug][server] enqueue skipped", error);
          }
        }
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch (error) {
          if (SERVER_REASONING_DEBUG) {
            console.warn("[Reasoning Debug][server] close skipped", error);
          }
        }
      };

      const enqueueReasoningChunk = (text: string) => {
        const chunk = text.trim();
        if (chunk.length === 0) return;
        reasoningTranslateQueue = reasoningTranslateQueue
          .then(async () => {
            const withSeparator = (value: string) => {
              const normalized = value.trim();
              if (normalized.length === 0) return "";
              if (emittedReasoningChunkCount === 0) {
                emittedReasoningChunkCount += 1;
                return normalized;
              }
              emittedReasoningChunkCount += 1;
              return `\n\n${normalized}`;
            };

            if (!translationEnabled || !isMostlyEnglish(chunk)) {
              const textWithBreak = withSeparator(chunk);
              if (textWithBreak.length > 0) {
                safeEnqueue({ type: "reasoning", text: textWithBreak });
              }
              return;
            }

            try {
              const result = await translateReasoning(chunk, {
                targetLanguage,
                fallbackToSourceOnError: false,
              });
              const translated = result.translated.trim();
              const textWithBreak = withSeparator(
                translated.length > 0 ? translated : chunk,
              );
              safeEnqueue({
                type: "reasoning",
                text: textWithBreak,
              });
            } catch (error) {
              console.error("[Reasoning Translate][stream]", error);
              const textWithBreak = withSeparator(
                buildTranslationFailureText(targetLanguage, chunk),
              );
              safeEnqueue({
                type: "reasoning",
                text: textWithBreak,
              });
            }
          })
          .catch((error) => {
            console.error("[Reasoning Translate Queue]", error);
          });
      };

      const pushReasoningText = (text: string) => {
        if (text.length === 0) return;
        if (!translationEnabled) {
          safeEnqueue({ type: "reasoning", text });
          return;
        }

        pendingReasoning += text;
        while (true) {
          const { segment, rest } = takeReasoningSegment(pendingReasoning);
          pendingReasoning = rest;
          if (!segment) {
            break;
          }
          enqueueReasoningChunk(segment);
        }
      };

      const flushReasoningQueue = async () => {
        const tail = pendingReasoning.trim();
        if (tail.length > 0) {
          pendingReasoning = "";
          enqueueReasoningChunk(tail);
        }
        await reasoningTranslateQueue;
      };

      function onParse(event: any) {
        if (closed || event.type !== "event") return;
        const data = event.data;
        if (typeof data !== "string" || data.length === 0) return;

        // https://beta.openai.com/docs/api-reference/completions/create#completions/create-stream
        if (data === "[DONE]") {
          sawDone = true;
          if (SERVER_REASONING_DEBUG) {
            console.log("[Reasoning Debug][server] done marker", {
              traceId,
              ts: Date.now(),
              elapsedMs: Date.now() - streamStartedAt,
              contentDeltaCount,
              reasoningDeltaCount,
              contentTotalLen,
              reasoningTotalLen,
            });
          }
          return;
        }

        if (event.type === "event") {
          try {
            eventIndex += 1;
            const json = JSON.parse(data);
            const { content, reasoning } = extractDelta(json);
            if (SERVER_REASONING_DEBUG) {
              const model = json?.model ?? "-";
              const finishReason = json?.choices?.[0]?.finish_reason ?? null;
              const usage = json?.usage ?? null;
              const hasReasoningDetails =
                Array.isArray(json?.choices?.[0]?.delta?.reasoning_details) &&
                json.choices[0].delta.reasoning_details.length > 0;
              const delta = json?.choices?.[0]?.delta;
              const deltaKeys =
                delta && typeof delta === "object"
                  ? Object.keys(delta as Record<string, unknown>)
                  : [];
              if (
                content.length > 0 ||
                reasoning.length > 0 ||
                hasReasoningDetails ||
                finishReason ||
                usage
              ) {
                console.log("[Reasoning Debug][server]", {
                  traceId,
                  eventIndex,
                  ts: Date.now(),
                  model,
                  contentLen: content.length,
                  reasoningLen: reasoning.length,
                  hasReasoningDetails,
                  finishReason,
                  usage,
                  deltaKeys,
                  bodyPreview: data.slice(0, 500),
                  reasoningPreview: reasoning.slice(0, 100),
                });
              }
            }
            if (content.length > 0) {
              contentDeltaCount += 1;
              contentTotalLen += content.length;
              safeEnqueue({ type: "content", text: content });
            }
            if (reasoning.length > 0) {
              reasoningDeltaCount += 1;
              reasoningTotalLen += reasoning.length;
              pushReasoningText(reasoning);
            }
          } catch (e) {
            console.error("[Stream Parse]", {
              traceId,
              eventIndex,
              error: e,
              bodyPreview: String(data).slice(0, 500),
            });
          }
        }
      }

      const parser = createParser(onParse);
      try {
        for await (const chunk of res.body as any) {
          if (closed) break;
          parser.feed(decoder.decode(chunk, { stream: true }));
        }
        const tail = decoder.decode();
        if (tail.length > 0 && !closed) {
          parser.feed(tail);
        }
      } catch (error: any) {
        const code = error?.code ?? "";
        const name = error?.name ?? "";
        const isAbortLike =
          code === "ECONNRESET" ||
          code === "ERR_STREAM_PREMATURE_CLOSE" ||
          name === "AbortError";
        if (!isAbortLike) {
          console.error("[Stream Body]", error);
        } else if (SERVER_REASONING_DEBUG) {
          console.warn("[Reasoning Debug][server] upstream aborted", {
            traceId,
            code,
            name,
          });
        }
      }
      if (!sawDone && SERVER_REASONING_DEBUG) {
        console.warn("[Reasoning Debug][server] stream ended without [DONE]", {
          traceId,
          ts: Date.now(),
          elapsedMs: Date.now() - streamStartedAt,
          contentDeltaCount,
          reasoningDeltaCount,
          contentTotalLen,
          reasoningTotalLen,
        });
      }

      await flushReasoningQueue();
      safeEnqueue({ type: "done" });

      if (replayEnabled && replayRequest) {
        try {
          const hasDone = replayEvents.some((event) => event.type === "done");
          if (!hasDone) {
            replayEvents.push({ type: "done", atMs: Date.now() - streamStartedAt });
          }
          await persistReplayPayload(
            req,
            replayKey,
            replayRequest.request,
            {
            content: replayContent,
            reasoning: replayReasoning,
            events: replayEvents,
            },
          );
          console.log("[Replay] recorded", replayKey, replayEvents.length);
        } catch (error) {
          console.error("[Replay] record failed", error);
        }
      }

      safeClose();
    },
  });
  return stream;
}

export async function POST(req: NextRequest) {
  try {
    const stream = await createStream(req);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[Chat Stream]", error /*, error?.stack */);
    return new Response(
      ["```json\n", JSON.stringify(error, null, "  "), "\n```"].join(""),
    );
  }
}

export const runtime = "edge";
// export const config = {
//   runtime: "edge",
// };
