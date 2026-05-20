import { NextRequest, NextResponse } from "next/server";

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

export function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/backend") ||
    request.nextUrl.pathname.startsWith("/api/auth/session")
  ) {
    const target = new URL(backendUrl);

    const url = request.nextUrl.clone();

    // Always use env backend
    url.protocol = target.protocol;
    url.hostname = target.hostname;
    url.port = target.port;

    // Remove /backend prefix
    if (request.nextUrl.pathname.startsWith("/backend")) {
      url.pathname = request.nextUrl.pathname.replace("/backend", "");
    }

    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/backend/:path*", "/api/auth/session/:path*"],
};
