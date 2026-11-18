/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
export async function retrySettlementSnapshotTransaction(dependencies: Pick<WorkDependencies, "snapshotRetryPatch" | "workCollection">, ref: any, params: any, transaction: any) {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
        throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    const fundingId = String(current.payload.intentId ?? "");
    if (!fundingId)
        throw new Error("SETTLEMENT_FUNDING_REFERENCE_MISMATCH");
    const funding = await transaction.get(dependencies.workCollection.doc(fundingId));
    if (!funding.exists)
        throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
    const patch = dependencies.snapshotRetryPatch(current, funding.data() as ReceiverWork, params.expectedVersion, params.requestedBy);
    // Funding, original payload/commitment and rejection history are preserved.
    // A new Node lease must independently verify chain funding and prove again.
    transaction.update(ref, patch);
    return { id: current.id, status: patch.status, stateVersion: patch.stateVersion };
}
