import { randomUUID } from "node:crypto";
import type { RelayDependencies } from "./types";

/** Publish a durable payload-free revision; Receiver never opens a connection to Node. */
export async function signalLocalNode(dependencies: Pick<RelayDependencies, "db" | "activity" | "clock">): Promise<void> {
  await dependencies.db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(dependencies.activity);
    const state = snapshot.exists ? snapshot.data() : {};
    const revision = Number(state.revision ?? 0);
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw new Error("NODE_RELAY_REVISION_INVALID");
    transaction.set(dependencies.activity, { ...state, epoch: state.epoch ?? randomUUID(), revision: revision + 1, updatedAt: new dependencies.clock().toISOString() });
  });
}
