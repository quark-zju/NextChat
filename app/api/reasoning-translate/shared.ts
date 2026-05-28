import { getProviderConfig } from "../common";

export const DEFAULT_TRANSLATION_MODEL = "openai/gpt-4o-mini";
export const DEFAULT_TARGET_LANGUAGE = "zh-CN";
const MAX_SEGMENT_CHARS = 500;

export type TranslationSegment = {
  source: string;
  translated: string;
  failed: boolean;
};

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
  const requestModel =
    providerConfig.provider === "openai" && model.startsWith("openai/")
      ? model.slice("openai/".length)
      : model;
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
        model: requestModel,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              "You are a translation engine.",
              "Translate ALL text into the target language, including plain heading lines and section titles.",
              "Preserve markdown and line-break structure exactly (paragraphs, bullets, blank lines).",
              "Do not keep English heading lines unless they are proper nouns or product names.",
              "Example:",
              "Input: Assessing the Request\\n\\nI am analyzing the prompt.",
              "Output (zh-CN): 评估请求\\n\\n我正在分析这个提示。",
              "Output translation only.",
            ].join(" "),
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

export function isMostlyEnglish(text: string) {
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return latinCount >= 40 && latinCount > cjkCount * 2;
}

export async function translateReasoning(
  reasoning: string,
  options?: {
    targetLanguage?: string;
    model?: string;
    fallbackToSourceOnError?: boolean;
  },
) {
  const normalized = reasoning.trim();
  if (normalized.length === 0) {
    return {
      translated: "",
      segments: [] as TranslationSegment[],
      model: options?.model ?? DEFAULT_TRANSLATION_MODEL,
      hasFailures: false,
    };
  }

  const targetLanguage = options?.targetLanguage ?? DEFAULT_TARGET_LANGUAGE;
  const model = options?.model ?? DEFAULT_TRANSLATION_MODEL;
  const fallbackToSourceOnError = options?.fallbackToSourceOnError ?? true;
  const segments = splitReasoning(normalized);
  let hasFailures = false;

  const translatedSegments = await Promise.all(
    segments.map(async (segment) => {
      try {
        const translated = await translateSegment(
          segment,
          targetLanguage,
          model,
        );
        return {
          source: segment,
          translated: translated || segment,
          failed: false,
        };
      } catch (error) {
        if (!fallbackToSourceOnError) {
          throw error;
        }
        hasFailures = true;
        return {
          source: segment,
          translated: segment,
          failed: true,
        };
      }
    }),
  );

  return {
    translated: translatedSegments.map((v) => v.translated).join("\n\n"),
    segments: translatedSegments,
    model,
    hasFailures,
  };
}
