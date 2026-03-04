import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_TARGET_LANGUAGE,
  DEFAULT_TRANSLATION_MODEL,
  translateReasoning,
} from "./shared";

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
    const result = await translateReasoning(reasoning, {
      targetLanguage,
      model,
      fallbackToSourceOnError: true,
    });

    return NextResponse.json({
      translated: result.translated,
      segments: result.segments,
      model: result.model,
      hasFailures: result.hasFailures,
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
