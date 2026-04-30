import { NextRequest, NextResponse } from "next/server";

export function addCorsHeaders(response: NextResponse, origin?: string | null) {
  // Allow both development and production frontend origins
  const allowedOrigins = [
    "http://localhost:3001",
    "https://trustlink-pay.vercel.app"
  ];
  
  const allowedOrigin = allowedOrigins.includes(origin || "") ? origin : "http://localhost:3001";
  
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin || "http://localhost:3001");
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
