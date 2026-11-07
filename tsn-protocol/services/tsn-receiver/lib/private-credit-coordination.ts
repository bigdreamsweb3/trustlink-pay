import { db, workCollection } from "./firebase";
import { createReceivedWork, type ReceiverWork, type WorkKind } from "./work-contract";
import { getWorkForNode } from "./store";

/** Bounded pages over immutable work IDs; completed history cannot block new work. */
export async function coordinationInventory(after = "") {
  if (after.length > 200 || /[\/\x00-\x1f]/.test(after)) throw new Error("PRIVATE_CREDIT_CURSOR_INVALID");
  let query = workCollection.orderBy("id");
  if (after) query = query.where("id", ">", after);
  const rows = await query.limit(200).get();
  const kinds: WorkKind[] = ["AUTHORIZED_FUNDING", "SETTLEMENT", "TCAP_FUNDING_POOL", "TCAP_EPOCH_ACCOUNTING"];
  const result: ReceiverWork[] = [];
  for (const row of rows.docs) {
    const stored = row.data() as ReceiverWork;
    if (!kinds.includes(stored.kind)) continue;
    const work = stored.kind === "AUTHORIZED_FUNDING" ? await getWorkForNode(row.id) : stored;
    if (work) result.push(work);
  }
  return { work: result, nextCursor: rows.docs.length === 200 ? rows.docs[199].id : null };
}

/** Enqueue only the two dedicated native coordination kinds, idempotently. */
export async function enqueueCoordination(input: { id: string; kind: WorkKind; payload: Record<string, unknown> }) {
  if (!["TCAP_FUNDING_POOL", "TCAP_EPOCH_ACCOUNTING"].includes(input.kind)
      || !/^tcap-(pool|epoch)-[a-f0-9]{64}$/.test(input.id)) throw new Error("PRIVATE_COORDINATION_KIND_INVALID");
  const work = createReceivedWork(input);
  const ref = workCollection.doc(work.id);
  return db.runTransaction(async (tx: any) => {
    const row = await tx.get(ref);
    if (row.exists) {
      const old = row.data() as ReceiverWork;
      if (old.kind !== work.kind || old.payloadCommitment !== work.payloadCommitment) throw new Error("IDEMPOTENCY_CONFLICT");
      return old;
    }
    tx.create(ref, work);
    return work;
  });
}

/** Waiting is a bounded deferral, never a permanent rejection of valid funding. */
export async function deferPrivateCredit(input: { id: string; owner: string; expectedVersion: number; seconds: number }) {
  if (!Number.isSafeInteger(input.seconds) || input.seconds < 1 || input.seconds > 60) throw new Error("INVALID_DEFERRAL");
  const ref = workCollection.doc(input.id);
  return db.runTransaction(async (tx: any) => {
    const row = await tx.get(ref);
    if (!row.exists) throw new Error("WORK_NOT_FOUND");
    const work = row.data() as ReceiverWork;
    if (!["SETTLEMENT", "TCAP_FUNDING_POOL", "TCAP_EPOCH_ACCOUNTING"].includes(work.kind)
        || work.status !== "NODE_VERIFYING" || work.stateVersion !== input.expectedVersion
        || work.nodeLease?.owner !== input.owner || Date.parse(work.nodeLease.expiresAt) <= Date.now()) throw new Error("LEASE_INVALID");
    const patch = { status: "RECEIVED", stateVersion: work.stateVersion + 1, nodeLease: null,
      deferredUntil: new Date(Date.now() + input.seconds * 1000).toISOString(), updatedAt: new Date().toISOString() };
    tx.update(ref, patch);
    return { id: work.id, ...patch };
  });
}
