/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { now } from "./now";
import { verifiedFieldEntry } from "../contracts/verification/verified-field-entry";
export async function recordSubmissionTransaction(dependencies: Pick<WorkDependencies, "payloadCommitment">, ref: any, evidence: any, params: any, transaction: any) {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists)
        throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    const stage = { SETTLEMENT: "TCAP_GPRU_MEMO_CREDIT_V2_SIGNED", TCAP_EPOCH_ACCOUNTING: "TCAP_EPOCH_ACCOUNTING_V1_SIGNED", TIN_DEBIT: "TCAP_GPRU_TIN_DEBIT_V1_SIGNED" } as Record<string, string>;
    if (!stage[current.kind] || evidence.stage !== stage[current.kind] || current.status !== "CRANKER_LEASED"
        || current.authorization?.kind !== (current.kind === "SETTLEMENT" ? "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3" : current.kind === "TIN_DEBIT" ? "TSN_TCAP_GPRU_TIN_DEBIT_AUTHORIZATION_V1" : "TSN_TCAP_COORDINATION_AUTHORIZATION_V1"))
        throw new Error("SETTLEMENT_SUBMISSION_NOT_LEASED");
    if (current.stateVersion !== params.expectedVersion)
        throw new Error("STALE_STATE_VERSION");
    const lease = current.crankerLease;
    if (!lease || lease.owner !== params.owner || !Number.isFinite(Date.parse(lease.expiresAt))
        || Date.parse(lease.expiresAt) <= Date.now())
        throw new Error("LEASE_INVALID");
    const result = Object.fromEntries(["signature", "blockhash", "lastValidBlockHeight", "wireSha256", "wireBytes", "stage"].map(verifiedFieldEntry.bind(null, evidence)));
    if (current.result && Object.keys(current.result).length) {
        if (dependencies.payloadCommitment(current.result) !== dependencies.payloadCommitment(result))
            throw new Error("SETTLEMENT_SUBMISSION_ALREADY_RECORDED");
        return { id: current.id, stateVersion: current.stateVersion, signature: result.signature };
    }
    // Receipt checkpoint, not a new lease/authorization generation.
    transaction.update(ref, { result, updatedAt: now() });
    return { id: current.id, stateVersion: current.stateVersion, signature: result.signature };
}
