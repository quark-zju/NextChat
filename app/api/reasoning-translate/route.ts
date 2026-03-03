import { NextRequest, NextResponse } from "next/server";
import { getProviderConfig } from "../common";

const DEFAULT_TRANSLATION_MODEL = "openai/gpt-4o-mini";
const DEFAULT_TARGET_LANGUAGE = "zh-CN";
const MAX_SEGMENT_CHARS = 500;

function splitReasoning(text: string, maxChars = MAX_SEGMENT_CHARS) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];

  const blocks = normalized
    .split(/\n{2,}/)
    .map((v) => v.trim())
    .filter(Boolean);

  const pieces = blocks.length > 0 ? blocks : [normalized];
  const segments: string[] = [];

  for (const piece of pieces) {
    if (piece.length <= maxChars) {
      segments.push(piece);
      continue;
    }

    // Fallback split for long paragraphs.
    const sentences = piece
      .split(/(?<=[。！？.!?])\s+/)
      .map((v) => v.trim())
      .filter(Boolean);

    if (sentences.length === 0) {
      for (let i = 0; i < piece.length; i += maxChars) {
        segments.push(piece.slice(i, i + maxChars));
      }
      continue;
    }

    let current = "";
    for (const sentence of sentences) {
      if (current.length === 0) {
        current = sentence;
        continue;
      }

      if (current.length + 1 + sentence.length <= maxChars) {
        current += ` ${sentence}`;
      } else {
        segments.push(current);
        current = sentence;
      }
    }

    if (current.length > 0) {
      segments.push(current);
    }
  }

  return segments;
}

async function translateSegment(
  segment: string,
  targetLanguage: string,
  model: string,
) {
  const requestPath = "v1/chat/completions";
  const providerConfig = getProviderConfig(requestPath, model);
  if (!providerConfig.apiKey) {
    throw new Error(`Missing API key for ${providerConfig.provider}`);
  }

  const response = await fetch(
    `https://${providerConfig.baseUrl}/${requestPath}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`,
        ...providerConfig.headers,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "You are a translation engine. Translate the user text accurately and naturally. Keep paragraph and bullet structure. Output translation only.",
          },
          {
            role: "user",
            content: `Target language: ${targetLanguage}\n\n${segment}`,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Translate failed (${response.status}): ${errorText.slice(0, 500)}`,
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      reasoning?: string;
      targetLanguage?: string;
      model?: string;
    };

    const reasoning = body.reasoning?.trim() ?? "";
    if (reasoning.length === 0) {
      return NextResponse.json(
        { error: true, msg: "Empty reasoning" },
        { status: 400 },
      );
    }

    const targetLanguage = body.targetLanguage ?? DEFAULT_TARGET_LANGUAGE;
    const model = body.model ?? DEFAULT_TRANSLATION_MODEL;
    const segments = splitReasoning(reasoning);

    const translatedSegments = await Promise.all(
      segments.map(async (segment) => {
        try {
          const translated = await translateSegment(segment, targetLanguage, model);
          return { source: segment, translated: translated || segment };
        } catch {
          return { source: segment, translated: segment };
        }
      }),
    );

    return NextResponse.json({
      translated: translatedSegments.map((v) => v.translated).join("\n\n"),
      segments: translatedSegments,
      model,
    });
  } catch (error) {
    console.error("[Reasoning Translate]", error);
    return NextResponse.json(
      { error: true, msg: "Translate failed" },
      { status: 500 },
    );
  }
}

export const runtime = "edge";
