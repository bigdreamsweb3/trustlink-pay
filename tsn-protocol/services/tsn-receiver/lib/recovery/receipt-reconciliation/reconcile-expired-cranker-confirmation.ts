import type { Dependencies } from "./dependencies";
import { reconcileReceipt } from "./reconcile-receipt";

/** reconcileExpiredCrankerConfirmation component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function reconcileExpiredCrankerConfirmation(dependencies: Pick<Dependencies, "workCollection" | "database" | "wakeNode" | "clock" | "environment" | "fetch">, params: { id: string; owner: string; expectedVersion: number; signature: string }) {
  if (!params.owner) throw new Error("SETTLEMENT_LATE_REPORT_NOT_ELIGIBLE");
  return reconcileReceipt(dependencies, { ...params, execute: true }, params.owner);
}
