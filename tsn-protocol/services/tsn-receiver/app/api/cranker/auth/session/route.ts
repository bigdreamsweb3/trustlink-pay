import { NextRequest, NextResponse } from "next/server";
import { issueCrankerSession } from "../../../../../lib/cranker-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      publicKey?: string;
      nonce?: string;
      timestamp?: string;
      signature?: string;
    };
    const session = await issueCrankerSession({
      publicKey: body.publicKey?.trim() ?? "",
      nonce: body.nonce?.trim() ?? "",
      timestamp: body.timestamp?.trim() ?? "",
      signature: body.signature?.trim() ?? "",
    });
    return NextResponse.json(session, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message.startsWith("CRANKER_") ? 401 : 400;
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
