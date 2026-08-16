import { randomUUID } from "node:crypto";
import { getDatabase } from "firebase-admin/database";
import { app } from "./firebase";

/**
 * Publish only a control marker. Firestore remains the source of truth; a
 * Cranker must lease and re-read verified work after receiving this signal.
 */
export async function publishCrankerWake(reason: string): Promise<void> {
  const databaseURL = process.env.FIREBASE_DATABASE_URL?.trim();
  if (!databaseURL) return;

  try {
    await getDatabase(app).ref("tsn/crankerWake").set({
      nonce: randomUUID(),
      kind: reason.slice(0, 64),
      createdAt: Date.now(),
    });
  } catch (error) {
    // A wake is an optimization, never a submission failure. Durable work is
    // already in Firestore and the Cranker retains its bounded fallback poll.
    console.warn("TSN Cranker wake publication failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
