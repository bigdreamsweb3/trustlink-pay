import { runTransactionCase39 } from "./run-transaction-case39.mjs";

export async function resetComponent(captures, value) {
    const resetComponentContext = {};
    resetComponentContext.value = value;
    return captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.db.runTransaction(runTransactionCase39.bind(null, {
        verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext: captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext,
        resetComponentContext: resetComponentContext
    }));
}
