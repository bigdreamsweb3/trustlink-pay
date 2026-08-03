import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function receiverUrl() {
  return (process.env.TSN_RECEIVER_URL ?? process.env.NEXT_PUBLIC_TSN_RECEIVER_URL ?? "http://127.0.0.1:8010").replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  try {
    const response = await fetch(`${receiverUrl()}/tin-operations`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: await request.text(),
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store, private",
      },
    });
  } catch {
    return NextResponse.json({ error: "TIN operation service is unavailable" }, { status: 503 });
  }
}
