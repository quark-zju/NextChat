import { NextRequest, NextResponse } from "next/server";

const OPENAI_URL = "api.openai.com";
const DEFAULT_PROTOCOL = "https";
const PROTOCOL = process.env.PROTOCOL ?? DEFAULT_PROTOCOL;
const BASE_URL = process.env.BASE_URL ?? OPENAI_URL;

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

  const apiKey = req.headers.get("token");
  const openaiPath = req.headers.get("path");

  console.log("[Proxy] ", openaiPath);

  return fetch(`${PROTOCOL}://${BASE_URL}/${openaiPath}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    method: req.method,
    body: req.body,
  });
}
