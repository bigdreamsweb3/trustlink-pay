import type { Dependencies } from "./dependencies";
import { reconcileReceipt } from "./reconcile-receipt";

/** reconcileSettlementReceipt component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function reconcileSettlementReceipt(dependencies: Pick<Dependencies, "workCollection" | "database" | "wakeNode" | "clock" | "environment" | "fetch">, params: { id: string; expectedVersion: number; signature: string; execute: boolean }) {
  return reconcileReceipt(dependencies, params);
}
