import type { TransactionPort, DocumentPort } from "../../storage/ports";
import type { Dependencies } from "./dependencies";
import { payloadCommitment } from "../../work-contract";
import type { ReceiverWork } from "../../work-contract";
import { assertEligible } from "./assert-eligible";
import { receiptContextCommitment } from "./receipt-context-commitment";

/** recordReceiptReconciliation component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function recordReceiptReconciliation(dependencies: Pick<Dependencies, "clock" | "workCollection">, context: { ref: DocumentPort; funding: ReceiverWork | null; params: { id: string; expectedVersion: number; signature: string; execute: boolean; }; reportOwner: string | undefined; work: ReceiverWork; evidence: { signature: string; stage: string; slot: any; confirmationStatus: string; sequence?: undefined; authorizationDigest?: undefined; } | { signature: string; stage: string; sequence: string; authorizationDigest: string; slot: any; confirmationStatus: string; }; preview: { id: string; status: import("../../work-contract.js").WorkStatus; stateVersion: number; receipt: { signature: string; stage: string; slot: any; confirmationStatus: string; sequence?: undefined; authorizationDigest?: undefined; } | { signature: string; stage: string; sequence: string; authorizationDigest: string; slot: any; confirmationStatus: string; }; executed: boolean; } }, transaction: TransactionPort) {
const { ref, funding, params, reportOwner, work, evidence, preview } = context;

    const fresh = (await transaction.get(ref)).data() as ReceiverWork;
    const freshFunding = funding ? (await transaction.get(dependencies.workCollection.doc(funding.id))).data() as ReceiverWork : null;
    assertEligible(dependencies, fresh, freshFunding, params.expectedVersion, reportOwner);
    if (receiptContextCommitment(fresh, Boolean(reportOwner)) !== receiptContextCommitment(work, Boolean(reportOwner)) || payloadCommitment(freshFunding) !== payloadCommitment(funding)) throw new Error("STALE_STATE_VERSION");
    const reconciledAt = new dependencies.clock().toISOString();
    transaction.update(ref, { status: "CONFIRMED", stateVersion: fresh.stateVersion + 1, updatedAt: reconciledAt,
      result: { ...evidence, reconciledAt }, authorization: null, nodeLease: null, crankerLease: null,
      reconciliationHistory: [...((fresh as any).reconciliationHistory ?? []), { ...(reportOwner
        ? { reportedStateVersion: params.expectedVersion, previousStateVersion: fresh.stateVersion, previousStatus: fresh.status, reportedBy: reportOwner }
        : { failedStateVersion: fresh.stateVersion }),
        previousResult: fresh.result, authorizationCommitment: payloadCommitment(fresh.authorization!), reconciledAt, signature: params.signature }] });
    return { ...preview, status: "CONFIRMED", stateVersion: fresh.stateVersion + 1, executed: true };
  
}
