import { NextRequest, NextResponse } from "next/server";
import { requestOpenai } from "../common";

function sanitizeProxyHeaders(source: Headers) {
  const headers = new Headers(source);
  const blocked = [
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "connection",
    "keep-alive",
    "set-cookie",
    "server",
    "alt-svc",
    "strict-transport-security",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "upgrade",
  ];

  for (const key of Array.from(headers.keys())) {
    if (key.toLowerCase().startsWith("cf-")) {
      headers.delete(key);
    }
  }

  for (const key of blocked) {
    headers.delete(key);
  }
  return headers;
}

async function makeRequest(req: NextRequest) {
  try {
    const api = await requestOpenai(req);
    return new NextResponse(api.body, {
      status: api.status,
      statusText: api.statusText,
      headers: sanitizeProxyHeaders(api.headers),
    });
  } catch (e) {
    console.error("[OpenAI] ", req.body, e);
    return NextResponse.json(
      {
        error: true,
        msg: JSON.stringify(e),
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(req: NextRequest) {
  return makeRequest(req);
}

export async function GET(req: NextRequest) {
  return makeRequest(req);
}
