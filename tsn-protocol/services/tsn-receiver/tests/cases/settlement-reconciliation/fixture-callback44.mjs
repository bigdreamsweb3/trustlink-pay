

export async function fixtureCallback44(captures, url, init) {
    const b = JSON.parse(init.body);
    if (!captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reclaimed) {
        captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reclaimed = true;
        await captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.reset({ ...captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.lateWork, status: "FAILED", stateVersion: 29, crankerLease: null });
    }
    return captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.failedRpcFetch(url, init);
}
