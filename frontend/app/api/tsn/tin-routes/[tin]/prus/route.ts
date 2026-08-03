import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function receiverUrl() {
  return (process.env.TSN_RECEIVER_URL ?? process.env.NEXT_PUBLIC_TSN_RECEIVER_URL ?? "http://127.0.0.1:8010").replace(/\/$/, "");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tin: string }> },
) {
  const { tin } = await context.params;
  const url = `${receiverUrl()}/tin-routes/${encodeURIComponent(tin)}/prus`;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "x-owner-pubkey-hash": request.headers.get("x-owner-pubkey-hash") ?? "",
      },
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
    return NextResponse.json({ error: "TIN route lookup is unavailable" }, { status: 503 });
  }
}
