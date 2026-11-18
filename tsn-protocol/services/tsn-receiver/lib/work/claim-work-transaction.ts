/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { now } from "./now";
export async function claimWorkTransaction(dependencies: Pick<WorkDependencies, "db" | "hasResolvedNonExecution" | "isSupportedWorkKind" | "workCollection">, candidate: any, status: any, next: any, owner: any, transaction: any) {
    const snapshot = await transaction.get(candidate.ref);
    if (!snapshot.exists || snapshot.get("status") !== status)
        return null;
    const current = snapshot.data() as ReceiverWork;
    if (!dependencies.isSupportedWorkKind(current.kind))
        return null;
    const serial = current.kind === "SETTLEMENT" || current.kind === "TCAP_EPOCH_ACCOUNTING";
    const lockRef = dependencies.db.collection("tsn_private_credit_locks").doc("global-root");
    if (serial && next === "NODE_VERIFYING") {
        const lock = await transaction.get(lockRef);
        const holderId = lock.exists ? String(lock.get("workId") ?? "") : "";
        const holder = holderId && holderId !== current.id ? await transaction.get(dependencies.workCollection.doc(holderId)) : null;
        if (holder?.exists) {
            const h = holder.data() as ReceiverWork;
            const active = h.status === "VERIFIED" || h.status === "CRANKER_LEASED" || h.status === "SUBMITTED"
                || (h.status === "FAILED" && Boolean(h.result?.signature) && !dependencies.hasResolvedNonExecution(h))
                || (h.status === "NODE_VERIFYING" && Date.parse(h.nodeLease?.expiresAt ?? "") > Date.now());
            if (dependencies.isSupportedWorkKind(h.kind) && active)
                return null;
        }
        transaction.set(lockRef, { workId: current.id });
    }
    // Native execution includes two full Node authorization passes before
    // signing, then bounded broadcast/confirmation. Recovery stays finite.
    const nativeCranker = next === "CRANKER_LEASED" && (current.kind === "TCAP_EPOCH_ACCOUNTING"
        || (current.kind === "SETTLEMENT" && current.verification?.verificationType === "TSN_TCAP_GPRU_HIDDEN_HEAD_V1"));
    const expiresAt = new Date(Date.now() + (nativeCranker ? 180000 : 60000)).toISOString();
    const patch = {
        status: next,
        stateVersion: current.stateVersion + 1,
        updatedAt: now(),
        ...(next === "NODE_VERIFYING"
            ? { nodeLease: { owner, expiresAt, leaseId: candidate.id, version: current.stateVersion + 1 } }
            : { crankerLease: { owner, expiresAt, leaseId: candidate.id, version: current.stateVersion + 1 } }),
    };
    transaction.update(candidate.ref, patch);
    return { ...current, ...patch } as ReceiverWork;
}
