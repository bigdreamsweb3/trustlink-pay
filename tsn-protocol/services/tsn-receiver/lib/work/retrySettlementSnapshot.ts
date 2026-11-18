/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { retrySettlementSnapshotTransaction } from "./retry-settlement-snapshot-transaction";
export async function retrySettlementSnapshot(dependencies: Pick<WorkDependencies, "db" | "snapshotRetryPatch" | "wakeTsnNode" | "workCollection">, params: {
    id: string;
    expectedVersion: number;
    requestedBy: string;
}) {
    const ref = dependencies.workCollection.doc(params.id);
    const result = await dependencies.db.runTransaction(retrySettlementSnapshotTransaction.bind(null, dependencies, ref, params));
    await dependencies.wakeTsnNode("SETTLEMENT_SNAPSHOT_RETRY");
    return result;
}
