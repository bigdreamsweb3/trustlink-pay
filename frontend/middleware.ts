import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const isDevelopment = process.env.NODE_ENV === "development";
  
  // Get backend URL from environment variable or fallback to localhost
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";
  const backendHost = new URL(backendUrl).hostname;
  const backendProtocol = new URL(backendUrl).protocol;
  
  // Proxy backend requests to the backend server
  if (request.nextUrl.pathname.startsWith("/backend")) {
    const url = request.nextUrl.clone();
    if (isDevelopment) {
      url.port = "3000"; // Backend port only in development
      url.hostname = "localhost";
      url.protocol = "http";
    } else {
      // In production, use the backend URL from environment
      url.hostname = backendHost;
      url.protocol = backendProtocol;
      url.port = ""; // Remove port for production
    }
    url.pathname = request.nextUrl.pathname.replace("/backend", "");
    return NextResponse.rewrite(url);
  }

  // Handle API auth session requests
  if (request.nextUrl.pathname.startsWith("/api/auth/session")) {
    const url = request.nextUrl.clone();
    if (isDevelopment) {
      url.port = "3000"; // Backend port only in development
      url.hostname = "localhost";
      url.protocol = "http";
    } else {
      // In production, use the backend URL from environment
      url.hostname = backendHost;
      url.protocol = backendProtocol;
      url.port = ""; // Remove port for production
    }
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/backend/:path*", "/api/auth/session/:path*"],
};
