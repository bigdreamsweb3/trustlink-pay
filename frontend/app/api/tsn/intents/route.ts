import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function receiverUrl() {
  return (process.env.TSN_RECEIVER_URL || process.env.NEXT_PUBLIC_TSN_RECEIVER_URL || "https://tsn-receiver-kappa.vercel.app").replace(/\/$/, "");
}

async function forward(request: NextRequest, method: "GET" | "POST") {
  const url = `${receiverUrl()}/intents${method === "GET" ? request.nextUrl.search : ""}`;
  try {
    const response = await fetch(url, {
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
    return NextResponse.json({ error: "TSN intent service is unavailable" }, { status: 503 });
  }
}

export function GET(request: NextRequest) { return forward(request, "GET"); }
export function POST(request: NextRequest) { return forward(request, "POST"); }
