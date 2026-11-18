/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { attachCrankerAuthorizationTransaction } from "./attach-cranker-authorization-transaction";
export async function attachCrankerAuthorization(dependencies: Pick<WorkDependencies, "db" | "workCollection">, params: {
    id: string;
    owner: string;
    expectedVersion: number;
    authorization: Record<string, unknown>;
}) {
    const ref = dependencies.workCollection.doc(params.id);
    return dependencies.db.runTransaction(attachCrankerAuthorizationTransaction.bind(null, ref, params));
}
