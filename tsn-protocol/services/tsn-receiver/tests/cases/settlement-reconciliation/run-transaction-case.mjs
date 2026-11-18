

export async function runTransactionCase(captures, tx) {
    await tx.get(captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id));
    tx.update(captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.workCollection.doc(captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id), { ...captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.work, status: "CRANKER_LEASED", result: null, crankerLease: { owner: captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer.toBase58(), expiresAt: new Date(captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.realNow() + 60000).toISOString(), leaseId: captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, version: 28 } });
}
