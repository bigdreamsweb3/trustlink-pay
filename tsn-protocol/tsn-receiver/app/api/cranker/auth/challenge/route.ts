import { NextRequest, NextResponse } from "next/server";
import { issueCrankerChallenge } from "../../../../../lib/cranker-auth";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { publicKey?: string };
    const publicKey = body.publicKey?.trim() ?? "";
    if (!publicKey) return NextResponse.json({ error: "publicKey is required" }, { status: 422 });
    return NextResponse.json(await issueCrankerChallenge(publicKey));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: message.includes("UNKNOWN") || message.includes("REVOKED") ? 403 : 400 });
  }
}
