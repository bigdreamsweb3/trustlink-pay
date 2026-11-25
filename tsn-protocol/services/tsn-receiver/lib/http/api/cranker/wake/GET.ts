import type { NextResponse } from "next/server";
import type { DocumentPort } from "../../../../storage/ports";

/** Publish only the existing opaque coordination hint. Claims retain their authentication and replay checks. */
export async function GET(dependencies: { control: DocumentPort; NextResponse: typeof NextResponse }) {
  try {
    const snapshot = await dependencies.control.get();
    const cursor = snapshot.exists ? snapshot.get("nonce") : "empty";
    if (typeof cursor !== "string" || !/^(?:empty|[0-9a-f-]{36})$/i.test(cursor)) {
      throw new Error("CRANKER_WAKE_CURSOR_INVALID");
    }
    return dependencies.NextResponse.json({ cursor }, { headers: { "cache-control": "no-store" } });
  } catch {
    return dependencies.NextResponse.json({ error: "CRANKER_WAKE_UNAVAILABLE" }, { status: 503 });
  }
}
