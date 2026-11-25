/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { getWorkForNode } from "./getWorkForNode";
import { lease } from "./lease";
import { projectWorkForNode } from "./projectWorkForNode";
import { assertNodeFundingLeaseFilter } from "./assert-node-funding-lease-filter";
export async function leaseForNode(dependencies: Pick<WorkDependencies, "db" | "decryptPayloadForNode" | "hasResolvedNonExecution" | "isSupportedWorkKind" | "randomInt" | "workCollection">, owner: string, supportedKinds?: WorkKind[], fundingPhase?: "AUTHORIZATION" | "SIGNED_DEPOSIT") {
    assertNodeFundingLeaseFilter(fundingPhase, supportedKinds);
    const work = await lease(dependencies, "RECEIVED", "NODE_VERIFYING", owner, supportedKinds, fundingPhase);
    if (!work)
        return work;
    if (work.kind === "SETTLEMENT")
        return await getWorkForNode(dependencies, work.id);
    if (work.kind !== "AUTHORIZED_FUNDING" && work.kind !== "TIN_DEBIT")
        return work;
    const envelope = work.payload.nodeEncryptedPayload;
    if (!envelope || typeof envelope !== "object")
        throw new Error("NODE_PAYLOAD_ENVELOPE_MISSING");
    return projectWorkForNode(dependencies, work);
}
