import { NextRequest, NextResponse } from "next/server";

export function addCorsHeaders(response: NextResponse, origin?: string | null) {
  // Allow origins from environment variable (comma-separated) plus localhost fallback
  const envOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const allowedOrigins = [
    "http://localhost:3001",
    "https://trustlink-pay.vercel.app",
    "https://trustlink-pay-backend.vercel.app",
    ...envOrigins,
  ];

  const allowedOrigin = allowedOrigins.includes(origin || "") ? origin : "https://trustlink-pay.vercel.app";

  response.headers.set("Access-Control-Allow-Origin", allowedOrigin || "https://trustlink-pay.vercel.app");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  response.headers.set("Access-Control-Allow-Credentials", "true");

  return response;
}

export function handleCors(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 200 });
    return addCorsHeaders(response, origin);
  }

  return null;
}
