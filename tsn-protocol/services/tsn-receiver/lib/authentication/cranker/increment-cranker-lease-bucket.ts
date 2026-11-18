import type { TransactionPort, DocumentPort } from "../../storage/ports";
import type { Dependencies } from "./dependencies";
import { MAX_LEASE_ATTEMPTS_PER_MINUTE } from "./configuration";

/** incrementCrankerLeaseBucket component. Inputs and results retain the original cranker-auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function incrementCrankerLeaseBucket(dependencies: Pick<Dependencies, "clock">, context: { reference: DocumentPort; publicKey: string; bucket: string }, transaction: TransactionPort) {
const { reference, publicKey, bucket } = context;

    const snapshot = await transaction.get(reference);
    const count = Number(snapshot.get("count") ?? 0);
    if (count >= MAX_LEASE_ATTEMPTS_PER_MINUTE) return false;
    transaction.set(reference, { publicKey, bucket, count: count + 1, updatedAt: new dependencies.clock().toISOString() }, { merge: true });
    return true;
  
}
