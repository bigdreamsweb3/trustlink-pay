import type { Dependencies } from "./dependencies";
import { randomUUID } from "node:crypto";
import { getDatabase } from "firebase-admin/database";

/** publishCrankerWake component. Inputs and results retain the original cranker-wake contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function publishCrankerWake(dependencies: Pick<Dependencies, "environment" | "clock" | "app">, reason: string): Promise<void> {
  const databaseURL = dependencies.environment.FIREBASE_DATABASE_URL?.trim();
  if (!databaseURL || !dependencies.app) return;

  try {
    await getDatabase(dependencies.app).ref("tsn/crankerWake").set({
      nonce: randomUUID(),
      kind: reason.slice(0, 64),
      createdAt: dependencies.clock.now(),
    });
  } catch (error) {
    // A wake is an optimization, never a submission failure. Durable work is
    // already in Firestore and the Cranker retains its bounded fallback poll.
    console.warn("TSN Cranker wake publication failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
