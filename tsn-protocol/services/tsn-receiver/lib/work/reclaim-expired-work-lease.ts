/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { now } from "./now";
export async function reclaimExpiredWorkLease(dependencies: Pick<WorkDependencies, "isSupportedWorkKind">, candidate: any, next: any, transaction: any) {
    const snapshot = await transaction.get(candidate.ref);
    if (!snapshot.exists || snapshot.get("status") !== next)
        return;
    const current = snapshot.data() as ReceiverWork;
    if (!dependencies.isSupportedWorkKind(current.kind))
        return;
    const currentLease = next === "NODE_VERIFYING" ? current.nodeLease : current.crankerLease;
    if (currentLease && Date.parse(currentLease.expiresAt) > Date.now())
        return;
    transaction.update(candidate.ref, {
        // Once a signed attempt is durable, never rebuild on lease expiry.
        // Its signature must be reconciled even if broadcast was interrupted.
        status: next === "NODE_VERIFYING" ? "RECEIVED"
            : current.result?.signature ? "FAILED" : ["SETTLEMENT", "TCAP_EPOCH_ACCOUNTING"].includes(current.kind) ? "RECEIVED" : "VERIFIED",
        stateVersion: current.stateVersion + 1,
        updatedAt: now(),
        nodeLease: null,
        crankerLease: null,
    });
}
