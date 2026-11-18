import { text } from "./text.mjs";

export function reportRequestComponent(captures, owner = captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.payer.toBase58(), body = { id: captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, expectedVersion: 28, status: "CONFIRMED", evidence: { signature: captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature } }) {
    const reportRequestComponentContext = {};
    reportRequestComponentContext.body = body;
    return ({ headers: new Headers(owner ? { "x-test-cranker": owner } : {}), text: text.bind(null, {
            reportRequestComponentContext: reportRequestComponentContext
        }) });
}
