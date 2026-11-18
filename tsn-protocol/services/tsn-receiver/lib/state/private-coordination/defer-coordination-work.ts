import type { TransactionPort, DocumentPort } from "../../storage/ports";
import type { Dependencies } from "./dependencies";
import type { ReceiverWork } from "../../work-contract";

/** deferCoordinationWork component. Inputs and results retain the original private-credit-coordination contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function deferCoordinationWork(dependencies: Pick<Dependencies, "clock">, context: { ref: DocumentPort; input: { id: string; owner: string; expectedVersion: number; seconds: number; } }, tx: TransactionPort) {
const { ref, input } = context;

    const row = await tx.get(ref);
    if (!row.exists) throw new Error("WORK_NOT_FOUND");
    const work = row.data() as ReceiverWork;
    if (!["SETTLEMENT", "TCAP_EPOCH_ACCOUNTING"].includes(work.kind)
        || work.status !== "NODE_VERIFYING" || work.stateVersion !== input.expectedVersion
        || work.nodeLease?.owner !== input.owner || dependencies.clock.parse(work.nodeLease.expiresAt) <= dependencies.clock.now()) throw new Error("LEASE_INVALID");
    const patch = { status: "RECEIVED", stateVersion: work.stateVersion + 1, nodeLease: null,
      deferredUntil: new dependencies.clock(dependencies.clock.now() + input.seconds * 1000).toISOString(), updatedAt: new dependencies.clock().toISOString() };
    tx.update(ref, patch);
    return { id: work.id, ...patch };
  
}
