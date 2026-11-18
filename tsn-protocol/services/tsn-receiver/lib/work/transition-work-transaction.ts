/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { now } from "./now";
import { paymentReceiptVerification } from "./paymentReceiptVerification";
import { redactedPaymentPayload } from "./redactedPaymentPayload";
import { fundingReadinessPatch } from "./funding-readiness-patch";
export async function transitionWorkTransaction(dependencies: Pick<WorkDependencies, "assertNodeVerificationAttestation" | "compactAuthorizedFundingVerification" | "compactVerificationPayload" | "encryptPayloadForNode" | "verifiedPayloadForWork">, ref: any, params: any, transaction: any) {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
        throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    // A response can be lost after Firestore commits (for example when a
    // hosted function briefly loses its upstream connection).  Allow the
    // Cranker to safely replay the same terminal report instead of turning a
    // successful on-chain submission into a false failure.  The signature is
    // the idempotency key for on-chain work; it is never accepted for a
    // different terminal status.
    if (params.actor === "cranker" && current.status === params.status) {
        const currentSignature = String(current.result?.signature ?? "");
        const reportedSignature = String(params.evidence?.signature ?? "");
        if (currentSignature && reportedSignature && currentSignature === reportedSignature) {
            return { work: current, fundingConfirmed: false };
        }
    }
    const lease = params.actor === "node" ? current.nodeLease : current.crankerLease;
    if (!lease || lease.owner !== params.owner || Date.parse(lease.expiresAt) <= Date.now()) {
        throw new Error("LEASE_INVALID");
    }
    if (current.stateVersion !== params.expectedVersion)
        throw new Error("STALE_STATE_VERSION");
    if (params.actor === "cranker" && current.result?.signature
        && params.evidence?.signature !== current.result.signature)
        throw new Error("SETTLEMENT_SUBMISSION_SIGNATURE_MISMATCH");
    if (params.actor === "node" && current.kind === "AUTHORIZED_FUNDING" && current.fundingPhase === "AUTHORIZATION" && params.status === "VERIFIED") throw new Error("FUNDING_DEPOSIT_NOT_ATTACHED");
    if (params.actor === "node" && (params.status === "VERIFIED" || params.status === "REJECTED" || params.status === "FUNDING_READY")) {
        dependencies.assertNodeVerificationAttestation({
            work: current,
            owner: params.owner,
            expectedVersion: params.expectedVersion,
            status: params.status,
            evidence: params.evidence,
        });
    }
    const allowed = params.actor === "node"
        ? ["VERIFIED", "REJECTED", "FUNDING_READY"]
        : ["SUBMITTED", "CONFIRMED", "FAILED"];
    if (!allowed.includes(params.status))
        throw new Error("INVALID_TRANSITION");
    const readinessPatch = params.actor === "node" && params.status === "FUNDING_READY" ? fundingReadinessPatch(dependencies, current, params.evidence) : {};
    const patch = {
        status: params.status,
        stateVersion: current.stateVersion + 1,
        updatedAt: now(),
        ...(params.actor === "node"
            ? {
                verification: params.status === "VERIFIED" && params.evidence?.verifiedPayload
                    ? current.kind === "AUTHORIZED_FUNDING"
                        ? dependencies.compactAuthorizedFundingVerification(redactedPaymentPayload(current.payload), params.evidence)
                        : dependencies.compactVerificationPayload(current.payload, params.evidence)
                    : params.evidence ?? {},
                nodeLease: null,
                ...(current.kind === "AUTHORIZED_FUNDING"
                    ? { payload: { ...redactedPaymentPayload(current.payload), ...(current.payload.nodeEncryptedPayload ? { nodeEncryptedPayload: current.payload.nodeEncryptedPayload } : {}) } }
                    : {}),
            }
            : {
                result: params.evidence ?? {},
                crankerLease: null,
                // The signed handoff transaction is needed only until funding has
                // confirmed. Keep a compact receipt context thereafter.
                ...(params.status === "CONFIRMED" && current.kind === "AUTHORIZED_FUNDING"
                    ? { verification: paymentReceiptVerification(dependencies, current) }
                    : {}),
                // A payout authorization contains the recipient wallet and is
                // short-lived work material, not a permanent settlement record.
                ...(params.status === "CONFIRMED" && current.kind === "SETTLEMENT"
                    ? { authorization: null }
                    : {}),
            }),
        ...readinessPatch,
    };
    const fundingConfirmed = params.actor === "cranker"
        && current.kind === "AUTHORIZED_FUNDING"
        && params.status === "CONFIRMED";
    transaction.update(ref, patch);
    return { work: { ...current, ...patch } as ReceiverWork, fundingConfirmed };
}
