/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { reclaimExpiredWorkLease } from "./reclaim-expired-work-lease";
import { compareAccountingPriority } from "./compare-accounting-priority";
import { claimWorkTransaction } from "./claim-work-transaction";
import { workWithStatus } from "./workWithStatus";
import { matchesFundingLeasePhase } from "./matches-funding-lease-phase";
export async function lease(dependencies: Pick<WorkDependencies, "db" | "hasResolvedNonExecution" | "isSupportedWorkKind" | "randomInt" | "workCollection">, status: "RECEIVED" | "VERIFIED", next: "NODE_VERIFYING" | "CRANKER_LEASED", owner: string, supportedKinds?: WorkKind[], fundingPhase?: "AUTHORIZATION" | "SIGNED_DEPOSIT") {
    if (fundingPhase !== undefined && next !== "NODE_VERIFYING") throw new Error("INVALID_NODE_FUNDING_FILTER");
    // Requeue abandoned leases before selecting fresh work. This prevents a
    // Node authorization failure or Cranker crash from permanently stranding
    // settlement work in an intermediate state.
    const stale = await workWithStatus(dependencies, next);
    for (const candidate of stale.docs) {
        const data = candidate.data() as ReceiverWork;
        if (!matchesFundingLeasePhase(data, fundingPhase))
            continue;
        if (!dependencies.isSupportedWorkKind(data.kind))
            continue;
        const leaseValue = next === "NODE_VERIFYING" ? data.nodeLease : data.crankerLease;
        if (!leaseValue || Date.parse(leaseValue.expiresAt) > Date.now())
            continue;
        await dependencies.db.runTransaction(reclaimExpiredWorkLease.bind(null, dependencies, candidate, next, fundingPhase));
    }
    // Avoid requiring a composite Firestore index for the hot lease path. The
    // bounded result set is ordered locally and remains deterministic.
    const candidates = await workWithStatus(dependencies, status);
    // Shared groups do not expose funding arrival order as settlement order.
    for (let i = candidates.docs.length - 1; i > 0; i--) {
        const j = dependencies.randomInt(i + 1);
        [candidates.docs[i], candidates.docs[j]] = [candidates.docs[j], candidates.docs[i]];
    }
    // Accounting frees dependent credits before selecting them.
    candidates.docs.sort(compareAccountingPriority);
    for (const candidate of candidates.docs) {
        if (!matchesFundingLeasePhase(candidate.data() as ReceiverWork, fundingPhase))
            continue;
        if (!dependencies.isSupportedWorkKind(candidate.get("kind")))
            continue;
        if (supportedKinds?.length && !supportedKinds.includes(candidate.get("kind") as WorkKind))
            continue;
        if (Date.parse(String(candidate.get("deferredUntil") ?? "")) > Date.now())
            continue;
        if (next === "CRANKER_LEASED") {
            const kind = candidate.get("kind") as WorkKind;
            const payload = candidate.get("payload") as Record<string, unknown>;
            const paymentId = kind === "SETTLEMENT" ? payload.intentId : null;
            if (paymentId) {
                const payment = await dependencies.workCollection.doc(String(paymentId)).get();
                if (!payment.exists || payment.get("kind") !== "AUTHORIZED_FUNDING" || payment.get("status") !== "CONFIRMED")
                    continue;
            }
        }
        if (next === "NODE_VERIFYING" && candidate.get("kind") === "SETTLEMENT") {
            const fundingId = String((candidate.get("payload") as Record<string, unknown>)?.intentId ?? "");
            const funding = fundingId ? await dependencies.workCollection.doc(fundingId).get() : null;
            if (!funding?.exists || funding.get("kind") !== "AUTHORIZED_FUNDING" || funding.get("status") !== "CONFIRMED")
                continue;
        }
        const leased = await dependencies.db.runTransaction(claimWorkTransaction.bind(null, dependencies, candidate, status, next, owner, fundingPhase));
        if (leased)
            return leased;
    }
    return null;
}
