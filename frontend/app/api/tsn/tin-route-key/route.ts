import { NextResponse } from "next/server";

export const runtime = "nodejs";

function receiverUrl() {
  const value =
    process.env.TSN_RECEIVER_URL ||
    process.env.NEXT_PUBLIC_TSN_RECEIVER_URL ||
    "https://tsn-receiver-kappa.vercel.app";
  return value.replace(/\/$/, "");
}

export async function GET() {
  try {
    const response = await fetch(`${receiverUrl()}/tin-routes/encryption-key`, {
      cache: "no-store",
      headers: { accept: "application/json" },
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
    return NextResponse.json(
      { error: "TSN route encryption key is unavailable" },
      { status: 503, headers: { "cache-control": "no-store, private" } },
    );
  }
}
