import { NextRequest, NextResponse } from "next/server";
import { findReplayPayload, saveReplayRecord } from "../replay";
import type { ReplayPayload, ReplayRequest } from "../replay-shared";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: true, msg: "missing key" }, { status: 400 });
  }

  try {
    const payload = await findReplayPayload(key);
    return NextResponse.json({ ok: true, payload: payload ?? null });
  } catch (error: any) {
    return NextResponse.json(
      { error: true, msg: String(error?.message ?? error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      key?: string;
      request?: ReplayRequest;
      payload?: ReplayPayload;
    };
    if (!body?.key || !body?.request || !body?.payload) {
      return NextResponse.json(
        { error: true, msg: "missing key/request/payload" },
        { status: 400 },
      );
    }

    await saveReplayRecord(body.key, body.request, body.payload);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: true, msg: String(error?.message ?? error) },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
