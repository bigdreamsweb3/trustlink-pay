import type { TransactionPort, DocumentPort } from "../../storage/ports";
import type { Dependencies } from "./dependencies";
import { nonExecutionContextCommitment } from "../../work-contract";
import { payloadCommitment } from "../../work-contract";
import type { ReceiverWork } from "../../work-contract";
import { assertEligible } from "./assert-eligible";

/** recordNonexecutionResolution component. Inputs and results retain the original failed-settlement-resolution contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function recordNonexecutionResolution(dependencies: Pick<Dependencies, "clock">, context: { ref: DocumentPort; fundingRef: DocumentPort | null; params: { id: string; expectedVersion: number; signature: string; execute: boolean; }; work: ReceiverWork | undefined; funding: ReceiverWork | undefined; evidence: { finalizedBlockHeight: string; lastValidBlockHeight: string; authorizationExpiresAtSlot: string; blockhash: unknown; signatureStatusContextSlot: number; finalizedSlot: number; rootSequence: string; attemptedSequence: string; commitmentRoot: string; previousRoot: any; kind: string; signature: string; }; preview: { id: string; status: import("../../work-contract.js").WorkStatus; stateVersion: number; resolution: { finalizedBlockHeight: string; lastValidBlockHeight: string; authorizationExpiresAtSlot: string; blockhash: unknown; signatureStatusContextSlot: number; finalizedSlot: number; rootSequence: string; attemptedSequence: string; commitmentRoot: string; previousRoot: any; kind: string; signature: string; }; executed: boolean; } }, transaction: TransactionPort) {
const { ref, fundingRef, params, work, funding, evidence, preview } = context;

    const fresh = (await transaction.get(ref)).data() as ReceiverWork;
    const freshFunding = fundingRef ? (await transaction.get(fundingRef)).data() as ReceiverWork | undefined : undefined;
    if (!fresh) throw new Error("WORK_NOT_FOUND");
    assertEligible(dependencies, fresh, freshFunding, params.expectedVersion, params.signature);
    if (payloadCommitment(fresh) !== payloadCommitment(work) || (freshFunding ? payloadCommitment(freshFunding) : null) !== (funding ? payloadCommitment(funding) : null)) throw new Error("STALE_STATE_VERSION");
    const resolvedAt = new dependencies.clock().toISOString();
    const resolution = { ...evidence, resolvedAt, previousStateVersion: fresh.stateVersion, resolvedStateVersion: fresh.stateVersion + 1,
      contextCommitment: nonExecutionContextCommitment(fresh), checkpointCommitment: payloadCommitment(fresh.result),
      authorizationCommitment: payloadCommitment(fresh.authorization), verificationCommitment: payloadCommitment(fresh.verification), payloadCommitment: fresh.payloadCommitment,
      ...(freshFunding ? { fundingWorkId: freshFunding.id, fundingStateVersion: freshFunding.stateVersion, fundingSignature: freshFunding.result!.signature, fundingCommitment: payloadCommitment(freshFunding) } : {}) };
    transaction.update(ref, { stateVersion: fresh.stateVersion + 1, updatedAt: resolvedAt, nonExecutionResolution: resolution,
      nonExecutionHistory: [...(fresh.nonExecutionHistory ?? []), resolution] });
    return { ...preview, stateVersion: fresh.stateVersion + 1, resolution, executed: true };
  
}
