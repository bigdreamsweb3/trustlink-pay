import { randomUUID } from "node:crypto";
import type { Dependencies } from "./dependencies";
/** A control marker is a hint; authoritative work remains protected by normal authenticated claims. */
export async function publishCrankerWake(dependencies: Dependencies, reason: string): Promise<void> {
  try { await dependencies.db.runTransaction(async transaction => {
    transaction.set(dependencies.db.collection("tsn_receiver_control").doc("cranker"), {nonce:randomUUID(),kind:reason.slice(0,64),createdAt:dependencies.clock.now()});
  }); } catch { console.warn("TSN Cranker coordination marker unavailable; durable work remains claimable"); }
}
