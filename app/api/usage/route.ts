import { NextRequest, NextResponse } from "next/server";
import { getUsageRemaining } from "../usage";

export async function GET(req: NextRequest) {
  const remaining = getUsageRemaining();
  return NextResponse.json({
    usageRemaining: remaining,
  });
}
