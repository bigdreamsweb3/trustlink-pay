/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import { now } from "./now";
export async function attachCrankerAuthorizationTransaction(ref: any, params: any, transaction: any) {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
        throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    if (current.status !== "CRANKER_LEASED" || current.crankerLease?.owner !== params.owner)
        throw new Error("LEASE_INVALID");
    if (current.stateVersion !== params.expectedVersion)
        throw new Error("STALE_STATE_VERSION");
    const lease = current.crankerLease;
    if (!lease || Date.parse(lease.expiresAt) <= Date.now())
        throw new Error("LEASE_EXPIRED");
    const authorizationLeaseId = String(params.authorization.leaseId ?? "");
    const authorizationLeaseVersion = Number(params.authorization.leaseVersion ?? 0);
    const authorizationLeaseExpiry = String(params.authorization.leaseExpiresAt ?? "");
    const authorizationExpiryTs = Number(params.authorization.expiresAtTs ?? 0);
    const leaseExpiryTs = Math.floor(Date.parse(lease.expiresAt) / 1000);
    if (authorizationLeaseId !== (lease.leaseId ?? current.id)
        || authorizationLeaseVersion !== Number(lease.version ?? current.stateVersion)
        || authorizationLeaseExpiry !== lease.expiresAt
        || !Number.isFinite(authorizationExpiryTs)
        || authorizationExpiryTs <= Math.floor(Date.now() / 1000)
        || authorizationExpiryTs > leaseExpiryTs) {
        throw new Error("LEASE_AUTHORIZATION_MISMATCH");
    }
    const patch = { authorization: params.authorization, stateVersion: current.stateVersion + 1, updatedAt: now() };
    transaction.update(ref, patch);
    return { ...current, ...patch } as ReceiverWork;
}
