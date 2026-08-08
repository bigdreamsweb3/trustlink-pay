import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function forward(request: NextRequest, method: "GET" | "POST") {
  const receiver = (process.env.TSN_RECEIVER_URL || process.env.NEXT_PUBLIC_TSN_RECEIVER_URL || "https://tsn-receiver-kappa.vercel.app").replace(/\/$/, "");
  try {
    const response = await fetch(`${receiver}/claim-requests${method === "GET" ? request.nextUrl.search : ""}`, {
      method,
      cache: "no-store",
      headers: { accept: "application/json", ...(method === "POST" ? { "content-type": "application/json" } : {}) },
      body: method === "POST" ? await request.text() : undefined,
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store, private" },
    });
  } catch {
    return NextResponse.json({ error: "TSN claim service is unavailable" }, { status: 503 });
  }
}

export function GET(request: NextRequest) { return forward(request, "GET"); }
export function POST(request: NextRequest) { return forward(request, "POST"); }
