import { NextRequest, NextResponse } from "next/server";
import { ACCESS_CODES } from "./app/api/access";
import md5 from "spark-md5";

export const config = {
  matcher: ["/api/:path*"],
};

export function middleware(req: NextRequest) {
  const accessCode = req.headers.get("access-code");
  const hashedCode = md5.hash(accessCode ?? "").trim();

  if (ACCESS_CODES.size > 0 && !ACCESS_CODES.has(hashedCode)) {
    return NextResponse.json(
      {
        error: true,
        needAccessCode: true,
        msg: "Please go settings page and fill your access code.",
      },
      {
        status: 401,
      },
    );
  }

  return NextResponse.next({
    request: {
      headers: req.headers,
    },
  });
}
