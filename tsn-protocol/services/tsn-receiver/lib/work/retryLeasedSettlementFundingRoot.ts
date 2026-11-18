/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { retryLeasedFundingRootTransaction } from "./retry-leased-funding-root-transaction";
export async function retryLeasedSettlementFundingRoot(dependencies: Pick<WorkDependencies, "db" | "nativeWorkRetryPatch" | "wakeTsnNode" | "workCollection">, params: {
    id: string;
    expectedVersion: number;
    owner: string;
    requestedBy: string;
    reason?: string;
}) {
    const ref = dependencies.workCollection.doc(params.id);
    const result = await dependencies.db.runTransaction(retryLeasedFundingRootTransaction.bind(null, dependencies, ref, params));
    await dependencies.wakeTsnNode("SETTLEMENT_FUNDED_ROOT_RETRY");
    return result;
}
