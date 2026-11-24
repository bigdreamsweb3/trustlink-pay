import type { Dependencies } from "./dependencies";
import type { ReceiverWork } from "../../work-contract";
import { assertEligible } from "./assert-eligible";
import { rpc } from "./rpc";
import { pda } from "./pda";
import { assertSettlementReceipt } from "./assert-settlement-receipt";
import { recordReceiptReconciliation } from "./record-receipt-reconciliation";
import { TSNP } from "./configuration";

/** reconcileReceipt component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function reconcileReceipt(dependencies: Pick<Dependencies, "workCollection" | "database" | "wakeNode" | "clock" | "environment" | "fetch">, params: { id: string; expectedVersion: number; signature: string; execute: boolean }, reportOwner?: string) {
  const ref = dependencies.workCollection.doc(params.id);
  const work = (await ref.get()).data() as ReceiverWork | undefined;
  if (!work) throw new Error("WORK_NOT_FOUND");
  const funding = work.kind === "SETTLEMENT" ? (await dependencies.workCollection.doc(String(work.payload.intentId)).get()).data() as ReceiverWork : null;
  if (work.kind === "SETTLEMENT" && !funding) throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
  assertEligible(dependencies, work, funding, params.expectedVersion, reportOwner);
  if (work.result?.signature && work.result.signature !== params.signature) throw new Error("SETTLEMENT_SUBMISSION_SIGNATURE_MISMATCH");
  const t = work.authorization!.transition as Record<string, any>;
  const [receipt, deposit, mother, root] = await Promise.all([
    rpc(dependencies, "getTransaction", [params.signature, { encoding: "base64", commitment: "finalized", maxSupportedTransactionVersion: 1 }]),
    funding ? rpc(dependencies, "getTransaction", [funding.result!.signature, { encoding: "base64", commitment: "finalized", maxSupportedTransactionVersion: 1 }]) : Promise.resolve(null),
    rpc(dependencies, "getAccountInfo", [pda("tsn_mother_escrow", TSNP).toBase58(), { encoding: "base64", commitment: "finalized" }]),
    rpc(dependencies, "getAccountInfo", [["SETTLEMENT", "TIN_DEBIT"].includes(work.kind) ? t.commitmentRoot : t.accountingEpoch, { encoding: "base64", commitment: "finalized" }]),
  ]);
  if (funding && deposit.meta?.err !== null) throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
  const evidence = assertSettlementReceipt(work, params.signature, receipt, mother.value, root.value, reportOwner);
  const preview = { id: work.id, status: work.status, stateVersion: work.stateVersion, receipt: evidence, executed: false };
  if (!params.execute) return preview;
  const repaired = await dependencies.database.runTransaction(recordReceiptReconciliation.bind(null, dependencies, { ref, funding, params, reportOwner, work, evidence, preview }));
  await dependencies.wakeNode("PRIVATE_CREDIT_RECEIPT_RECONCILED");
  return repaired;
}
