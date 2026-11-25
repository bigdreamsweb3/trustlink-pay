/** Stable settlement-reconciliation facade and production composition; implementations live in recovery/receipt-reconciliation. */
import { fetchResponse } from "./networking/common/fetch-response";
import { db } from "./database";
import { workCollection } from "./database";
import { wakeTsnNode } from "./node-wake";
import { reconcileSettlementReceipt as reconcileSettlementReceiptComponent } from "./recovery/receipt-reconciliation/reconcile-settlement-receipt";
import { reconcileExpiredCrankerConfirmation as reconcileExpiredCrankerConfirmationComponent } from "./recovery/receipt-reconciliation/reconcile-expired-cranker-confirmation";

const dependencies = {
  clock: Date,
  environment: process.env,
  fetch: fetchResponse,
  workCollection: workCollection,
  database: db,
  wakeNode: wakeTsnNode,
};

export { assertSettlementReceipt } from "./recovery/receipt-reconciliation/assert-settlement-receipt";

export const reconcileSettlementReceipt = reconcileSettlementReceiptComponent.bind(null, dependencies);

export const reconcileExpiredCrankerConfirmation = reconcileExpiredCrankerConfirmationComponent.bind(null, dependencies);
