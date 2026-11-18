/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { transitionWorkTransaction } from "./transition-work-transaction";
export async function transition(dependencies: Pick<WorkDependencies, "assertNodeVerificationAttestation" | "compactAuthorizedFundingVerification" | "compactVerificationPayload" | "db" | "encryptPayloadForNode" | "publishCrankerWake" | "verifiedPayloadForWork" | "wakeTsnNode" | "workCollection">, params: {
    id: string;
    actor: "node" | "cranker";
    owner: string;
    expectedVersion: number;
    status: WorkStatus;
    evidence?: Record<string, unknown>;
}) {
    const ref = dependencies.workCollection.doc(params.id);
    const result = await dependencies.db.runTransaction(transitionWorkTransaction.bind(null, dependencies, ref, params));
    // Node verification is the point at which Cranker work becomes leaseable.
    // Publish a fresh control-only wake after the Firestore transition commits;
    // the first ingress wake may have arrived before verification completed.
    if (params.actor === "node" && params.status === "VERIFIED") {
        await dependencies.publishCrankerWake("VERIFIED");
    }
    if (result.fundingConfirmed || (params.actor === "cranker" && params.status === "CONFIRMED" && ["SETTLEMENT", "TCAP_EPOCH_ACCOUNTING"].includes(result.work.kind))) {
        // Funding confirmation is a trigger only. The Node independently checks
        // the chain transaction before it verifies the pre-created settlement.
        await dependencies.wakeTsnNode("AUTHORIZED_FUNDING");
    }
    return result.work;
}
