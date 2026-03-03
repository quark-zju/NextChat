import { createParser } from "eventsource-parser";
import { NextRequest } from "next/server";
import { requestOpenai } from "../common";

const DEV_REASONING_DEBUG = process.env.NODE_ENV !== "production";

type StreamChunkEvent =
  | { type: "content"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "done" };

function encodeEvent(encoder: TextEncoder, event: StreamChunkEvent) {
  return encoder.encode(`${JSON.stringify(event)}\n`);
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

  const res = await requestOpenai(req);

  const contentType = res.headers.get("Content-Type") ?? "";
  if (!contentType.includes("stream")) {
    const content = await (
      await res.text()
    ).replace(/provided:.*. You/, "provided: ***. You");
    console.log("[Stream] error ", content);
    return "```json\n" + content + "```";
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let sawDone = false;
      let contentDeltaCount = 0;
      let reasoningDeltaCount = 0;
      let contentTotalLen = 0;
      let reasoningTotalLen = 0;

      const safeEnqueue = (event: StreamChunkEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(encoder, event));
        } catch (error) {
          closed = true;
          if (DEV_REASONING_DEBUG) {
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
          if (DEV_REASONING_DEBUG) {
            console.warn("[Reasoning Debug][server] close skipped", error);
          }
        }
      };

      function onParse(event: any) {
        if (closed || event.type !== "event") return;
        const data = event.data;
        if (typeof data !== "string" || data.length === 0) return;

        // https://beta.openai.com/docs/api-reference/completions/create#completions/create-stream
        if (data === "[DONE]") {
          sawDone = true;
          safeEnqueue({ type: "done" });
          if (DEV_REASONING_DEBUG) {
            console.log("[Reasoning Debug][server] done marker", {
              ts: Date.now(),
              elapsedMs: Date.now() - streamStartedAt,
              contentDeltaCount,
              reasoningDeltaCount,
              contentTotalLen,
              reasoningTotalLen,
            });
          }
          safeClose();
          return;
        }

        if (event.type === "event") {
          try {
            const json = JSON.parse(data);
            const { content, reasoning } = extractDelta(json);
            if (DEV_REASONING_DEBUG) {
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
                  ts: Date.now(),
                  model,
                  contentLen: content.length,
                  reasoningLen: reasoning.length,
                  hasReasoningDetails,
                  finishReason,
                  usage,
                  deltaKeys,
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
              safeEnqueue({ type: "reasoning", text: reasoning });
            }
          } catch (e) {
            console.error("[Stream Parse]", e, String(data).slice(0, 160));
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
        } else if (DEV_REASONING_DEBUG) {
          console.warn("[Reasoning Debug][server] upstream aborted", {
            code,
            name,
          });
        }
      }
      if (!sawDone && DEV_REASONING_DEBUG) {
        console.warn("[Reasoning Debug][server] stream ended without [DONE]", {
          ts: Date.now(),
          elapsedMs: Date.now() - streamStartedAt,
          contentDeltaCount,
          reasoningDeltaCount,
          contentTotalLen,
          reasoningTotalLen,
        });
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
