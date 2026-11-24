import type { Dependencies } from "./dependencies";
import { payloadCommitment } from "../../work-contract";
import type { ReceiverWork } from "../../work-contract";
import { hash } from "./hash";

/** assertEligible component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function assertEligible(dependencies: Pick<Dependencies, "clock">, work: ReceiverWork, funding: ReceiverWork | null, expectedVersion: number, reportOwner?: string) {
  const native = work.kind === "SETTLEMENT";
  const expectedKind = native ? "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3" : work.kind === "TIN_DEBIT" ? "TSN_TCAP_GPRU_TIN_DEBIT_AUTHORIZATION_V1" : "TSN_TCAP_COORDINATION_AUTHORIZATION_V1";
  const expectedStage = {SETTLEMENT:"TCAP_GPRU_MEMO_CREDIT_V2_SIGNED",TCAP_EPOCH_ACCOUNTING:"TCAP_EPOCH_ACCOUNTING_V1_SIGNED",TIN_DEBIT:"TCAP_GPRU_TIN_DEBIT_V1_SIGNED"}[work.kind as "SETTLEMENT"|"TCAP_EPOCH_ACCOUNTING"|"TIN_DEBIT"];
  if (!expectedStage) throw new Error("SETTLEMENT_RECONCILIATION_KIND_INVALID");
  if (reportOwner) {
    const auth = work.authorization;
    const expiry = dependencies.clock.parse(String(auth?.leaseExpiresAt ?? ""));
    if (work.nodeLease || auth?.kind !== expectedKind
        || !Number.isSafeInteger(expectedVersion) || auth.workStateVersion !== expectedVersion - 1
        || auth.leaseVersion !== auth.workStateVersion || auth.leaseId !== work.id
        || !Number.isFinite(expiry) || expiry > dependencies.clock.now()
        || work.result?.stage !== expectedStage || !work.result.signature) {
      throw new Error("SETTLEMENT_LATE_REPORT_NOT_ELIGIBLE");
    }
    if (work.status === "CRANKER_LEASED") {
      if (work.stateVersion !== expectedVersion || work.crankerLease?.owner !== reportOwner
          || work.crankerLease.expiresAt !== auth.leaseExpiresAt) throw new Error("SETTLEMENT_LATE_REPORT_NOT_ELIGIBLE");
    } else if (work.status !== "FAILED" || work.stateVersion !== expectedVersion + 1 || work.crankerLease) {
      throw new Error("SETTLEMENT_LATE_REPORT_NOT_ELIGIBLE");
    }
  } else {
    if (work.stateVersion !== expectedVersion) throw new Error("STALE_STATE_VERSION");
    if (work.status !== "FAILED" || work.nodeLease || work.crankerLease
        || work.authorization?.kind !== expectedKind) throw new Error("SETTLEMENT_RECONCILIATION_NOT_FAILED_NATIVE_CREDIT");
  }
  if (work.kind === "TIN_DEBIT") return;
  if (!native) { if (payloadCommitment(work.payload) !== work.payloadCommitment) throw new Error("PRIVATE_COORDINATION_PAYLOAD_MISMATCH"); return; }
  if (!funding || funding.kind !== "AUTHORIZED_FUNDING" || funding.status !== "CONFIRMED" || !funding.result?.signature) throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
  const id = `settlement-${hash(`${funding.id}:${funding.payloadCommitment}`).toString("hex").slice(0, 32)}`;
  if (work.id !== id || work.payload.intentId !== funding.id || payloadCommitment(work.payload) !== work.payloadCommitment) throw new Error("SETTLEMENT_FUNDING_REFERENCE_MISMATCH");
}
