/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { lease } from "./lease";
export function leaseForCranker(dependencies: Pick<WorkDependencies, "db" | "hasResolvedNonExecution" | "isSupportedWorkKind" | "randomInt" | "workCollection">, owner: string, supportedKinds?: WorkKind[]) {
    return lease(dependencies, "VERIFIED", "CRANKER_LEASED", owner, supportedKinds);
}
