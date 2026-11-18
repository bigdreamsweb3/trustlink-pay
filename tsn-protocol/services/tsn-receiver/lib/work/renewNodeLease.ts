/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { renewNodeLeaseTransaction } from "./renew-node-lease-transaction";
export async function renewNodeLease(dependencies: Pick<WorkDependencies, "db" | "workCollection">, params: {
    id: string;
    owner: string;
    expectedVersion: number;
    leaseId: string;
    leaseVersion: number;
}) {
    const ref = dependencies.workCollection.doc(params.id);
    return dependencies.db.runTransaction(renewNodeLeaseTransaction.bind(null, ref, params));
}
