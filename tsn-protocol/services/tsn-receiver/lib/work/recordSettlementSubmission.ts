/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { recordSubmissionTransaction } from "./record-submission-transaction";
export async function recordSettlementSubmission(dependencies: Pick<WorkDependencies, "db" | "payloadCommitment" | "workCollection">, params: {
    id: string;
    owner: string;
    expectedVersion: number;
    evidence: Record<string, unknown>;
}) {
    const evidence = params.evidence;
    if (!/^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(String(evidence.signature ?? ""))
        || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(evidence.blockhash ?? ""))
        || !/^\d+$/.test(String(evidence.lastValidBlockHeight ?? ""))
        || !/^[a-f0-9]{64}$/.test(String(evidence.wireSha256 ?? ""))
        || !Number.isSafeInteger(evidence.wireBytes) || Number(evidence.wireBytes) < 1 || Number(evidence.wireBytes) > 4096
        || !["TCAP_GPRU_MEMO_CREDIT_V2_SIGNED", "TCAP_EPOCH_ACCOUNTING_V1_SIGNED", "TCAP_GPRU_TIN_DEBIT_V1_SIGNED"].includes(String(evidence.stage)))
        throw new Error("SETTLEMENT_SUBMISSION_INVALID");
    const ref = dependencies.workCollection.doc(params.id);
    return dependencies.db.runTransaction(recordSubmissionTransaction.bind(null, dependencies, ref, evidence, params));
}
