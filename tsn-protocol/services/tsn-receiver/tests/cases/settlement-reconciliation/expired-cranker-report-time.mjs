/** Preserve the existing two-minute clock offset for synthetic expired Cranker reports. */
export function expiredCrankerReportTime(captures) {
    return captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.realNow() + 120000;
}
