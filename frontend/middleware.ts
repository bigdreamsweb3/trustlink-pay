import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // Proxy backend requests to the backend server
  if (request.nextUrl.pathname.startsWith("/backend")) {
    const url = request.nextUrl.clone();
    url.port = "3000"; // Backend port
    url.pathname = request.nextUrl.pathname.replace("/backend", "");
    return NextResponse.rewrite(url);
  }

  // Handle EventSource requests for session events
  if (request.nextUrl.pathname.startsWith("/api/auth/session/events")) {
    const url = request.nextUrl.clone();
    url.port = "3000"; // Backend port
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/backend/:path*", "/api/auth/session/events/:path*"],
};
