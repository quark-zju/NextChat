import { createParser } from "eventsource-parser";
import { NextRequest } from "next/server";
import { requestOpenai } from "../common";

type StreamChunkEvent =
  | { type: "content"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "done" };

function encodeEvent(encoder: TextEncoder, event: StreamChunkEvent) {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const record = item as Record<string, unknown>;
        const text = record.text ?? record.content ?? record.reasoning;
        return typeof text === "string" ? text : "";
      })
      .join("");
  }
  return "";
}

function extractDelta(json: Record<string, any>) {
  const delta = json?.choices?.[0]?.delta ?? {};
  let content = "";
  let reasoning = "";

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
      } else {
        content += text;
      }
    }
  } else {
    content += extractText(rawContent);
  }

  reasoning += extractText(delta?.reasoning);
  reasoning += extractText(delta?.thinking);
  reasoning += extractText(delta?.reasoning_content);
  reasoning += extractText(delta?.reasoning_details);

  return { content, reasoning };
}

async function createStream(req: NextRequest) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

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
      function onParse(event: any) {
        if (event.type === "event") {
          const data = event.data;
          // https://beta.openai.com/docs/api-reference/completions/create#completions/create-stream
          if (data === "[DONE]") {
            controller.enqueue(encodeEvent(encoder, { type: "done" }));
            controller.close();
            return;
          }
          try {
            const json = JSON.parse(data);
            const { content, reasoning } = extractDelta(json);
            if (content.length > 0) {
              controller.enqueue(
                encodeEvent(encoder, { type: "content", text: content }),
              );
            }
            if (reasoning.length > 0) {
              controller.enqueue(
                encodeEvent(encoder, { type: "reasoning", text: reasoning }),
              );
            }
          } catch (e) {
            console.error("[Stream Parse]", e);
          }
        }
      }

      const parser = createParser(onParse);
      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk));
      }
    },
  });
  return stream;
}

export async function POST(req: NextRequest) {
  try {
    const stream = await createStream(req);
    return new Response(stream);
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
