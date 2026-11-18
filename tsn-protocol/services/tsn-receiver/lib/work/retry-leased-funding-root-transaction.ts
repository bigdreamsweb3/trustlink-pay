/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
export async function retryLeasedFundingRootTransaction(dependencies: Pick<WorkDependencies, "nativeWorkRetryPatch" | "workCollection">, ref: any, params: any, transaction: any) {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
        throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    const fundingId = String(current.payload.intentId ?? "");
    const funding = fundingId ? await transaction.get(dependencies.workCollection.doc(fundingId)) : null;
    const patch = dependencies.nativeWorkRetryPatch(current, funding?.exists ? funding.data() as ReceiverWork : null, params.expectedVersion, params.owner, params.requestedBy, params.reason ?? "TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT");
    // The original deposit envelope remains on its confirmed funding record.
    // A new Node lease reopens that same note and reconstructs fresh membership.
    transaction.update(ref, patch);
    return { id: current.id, status: patch.status, stateVersion: patch.stateVersion };
}
