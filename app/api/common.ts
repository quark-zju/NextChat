import { NextRequest, NextResponse } from "next/server";

const OPENAI_BASE_URL = "api.openai.com";
const OPENROUTER_BASE_URL = "openrouter.ai/api";
const DEFAULT_PROTOCOL = "https";
const PROTOCOL = process.env.PROTOCOL ?? DEFAULT_PROTOCOL;
const HAS_OPENAI_KEY = !!process.env.OPENAI_API_KEY;

// Keep this list small and explicit. Add models here when you want
// direct OpenAI routing instead of default OpenRouter routing.
const OPENAI_DIRECT_MODELS = new Set<string>([
  "openai/gpt-4o-mini",
  "gpt-4o-mini",
  "openai/gpt-4.1-mini",
  "gpt-4.1-mini",
]);

function shouldUseOpenAI(path: string, model?: string) {
  if (path.startsWith("dashboard/")) return true;
  if (!HAS_OPENAI_KEY) return false;
  if (!model) return false;
  const normalized = model.startsWith("openai/")
    ? model.slice("openai/".length)
    : model;
  return (
    OPENAI_DIRECT_MODELS.has(model) || OPENAI_DIRECT_MODELS.has(normalized)
  );
}

export function getProviderConfig(path: string, model?: string) {
  const useOpenAI = shouldUseOpenAI(path, model);
  if (useOpenAI) {
    return {
      baseUrl: OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
      headers: {},
      provider: "openai",
    };
  }

  return {
    baseUrl: OPENROUTER_BASE_URL,
    apiKey: process.env.OPENROUTER_API_KEY,
    headers: {
      ...(process.env.OPENROUTER_HTTP_REFERER
        ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
        : {}),
      ...(process.env.OPENROUTER_X_TITLE
        ? { "X-Title": process.env.OPENROUTER_X_TITLE }
        : {}),
    },
    provider: "openrouter",
  };
}

export async function requestOpenai(req: NextRequest) {
  // Ask for usage information. Cannot check usage directly since
  // chat-stream needs to use the "edge" runtime for streaming
  // read ("nodejs" runtime seems to buffer the fetch()),
  // and the "edge" runtime does not support "fs".
  // const usageUrl = `${req.nextUrl.origin}/api/usage`;
  // const usageRes = await fetch(usageUrl, { method: "POST" });
  // const usageJson = await usageRes.json();
  // const usgaeRemaining = usageJson?.usageRemaining || 0;
  // if (usgaeRemaining <= 0) {
  //   throw new Error('No more usage available');
  // }

  const requestPath = req.headers.get("path") ?? "";
  const requestModel =
    req.headers.get("chat-model") ??
    req.headers.get("x-chat-model") ??
    undefined;
  const config = getProviderConfig(requestPath, requestModel);

  if (!requestPath) {
    return NextResponse.json(
      {
        error: true,
        msg: "Empty request path",
      },
      {
        status: 400,
      },
    );
  }

  if (!config.apiKey) {
    return NextResponse.json(
      {
        error: true,
        msg: `Missing API key for ${config.provider}`,
      },
      {
        status: 401,
      },
    );
  }

  console.log("[Proxy] ", requestPath, config.provider, requestModel ?? "-");

  let requestBody: BodyInit | null | undefined = req.body;
  if (
    config.provider === "openai" &&
    req.method !== "GET" &&
    req.method !== "HEAD"
  ) {
    try {
      const json = await req.json();
      if (
        json &&
        typeof json === "object" &&
        typeof (json as { model?: unknown }).model === "string"
      ) {
        const model = (json as { model: string }).model;
        if (model.startsWith("openai/")) {
          (json as { model: string }).model = model.slice("openai/".length);
        }
      }
      requestBody = JSON.stringify(json);
    } catch (error) {
      console.warn("[Proxy] failed to normalize OpenAI model name", error);
    }
  }

  return fetch(`${PROTOCOL}://${config.baseUrl}/${requestPath}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...config.headers,
    },
    method: req.method,
    body: requestBody,
    duplex: "half",
  } as RequestInit);
}
