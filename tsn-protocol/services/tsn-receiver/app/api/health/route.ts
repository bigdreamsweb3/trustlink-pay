import { NextResponse } from "next/server";
import { db } from "../../../lib/firebase";
export const runtime = "nodejs";
const storage = process.env.TSN_RECEIVER_STORE === "file" && process.env.TSN_ALLOW_LOCAL_JSON_STORE === "true"
  ? "FILE"
  : "FIREBASE";
export async function GET() {
  try {
    await db
      .collection(process.env.TSN_RECEIVER_STATE_COLLECTION ?? "tsn_receiver_state")
      .limit(1)
      .get();
    return NextResponse.json({ service: "TSN_RECEIVER", storage, status: "READY" });
  } catch (error) {
    console.error(`TSN Receiver ${storage} health check failed`, error);
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code ?? "FIREBASE_STORAGE_ERROR")
        : "FIREBASE_STORAGE_ERROR";
    return NextResponse.json(
      {
        service: "TSN_RECEIVER",
        storage,
        status: "DEGRADED",
        errorCode,
      },
      { status: 503 },
    );
  }
}
