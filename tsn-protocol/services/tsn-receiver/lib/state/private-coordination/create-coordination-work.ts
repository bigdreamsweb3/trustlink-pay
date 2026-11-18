import type { TransactionPort, DocumentPort } from "../../storage/ports";
import type { ReceiverWork } from "../../work-contract";
import type { WorkKind } from "../../work-contract";

/** createCoordinationWork component. Inputs and results retain the original private-credit-coordination contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function createCoordinationWork(context: { ref: DocumentPort; work: { id: string; kind: WorkKind; status: "RECEIVED"; stateVersion: number; payloadCommitment: string; payload: Record<string, unknown>; receivedAt: string; updatedAt: string; nodeLease: null; crankerLease: null; verification: null; result: null; authorization: null; } }, tx: TransactionPort) {
const { ref, work } = context;

    const row = await tx.get(ref);
    if (row.exists) {
      const old = row.data() as ReceiverWork;
      if (old.kind !== work.kind || old.payloadCommitment !== work.payloadCommitment) throw new Error("IDEMPOTENCY_CONFLICT");
      return old;
    }
    tx.create(ref, work);
    return work;
  
}
