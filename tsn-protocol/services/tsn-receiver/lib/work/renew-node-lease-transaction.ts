/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
export async function renewNodeLeaseTransaction(ref: any, params: any, transaction: any) {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
        throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    if (current.status !== "NODE_VERIFYING")
        throw new Error("NODE_LEASE_NOT_ACTIVE");
    if (current.stateVersion !== params.expectedVersion)
        throw new Error("STALE_STATE_VERSION");
    const lease = current.nodeLease;
    const renewedAt = Date.now();
    if (!lease || lease.owner !== params.owner
        || (lease.leaseId ?? current.id) !== params.leaseId
        || (lease.version ?? current.stateVersion) !== params.leaseVersion
        || !Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= renewedAt) {
        throw new Error("LEASE_INVALID");
    }
    const nodeLease = { ...lease, expiresAt: new Date(renewedAt + 60000).toISOString() };
    // Renewal preserves the claim generation and signed decision context.
    // Expired, reassigned or completed claims cannot be revived here.
    transaction.update(ref, { nodeLease, updatedAt: new Date(renewedAt).toISOString() });
    return { id: current.id, stateVersion: current.stateVersion, nodeLease };
}
