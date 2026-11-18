import { findIndexCase16 } from "./find-index-case16.mjs";

export function idxComponent(captures, k) {
    const idxComponentContext = {};
    idxComponentContext.k = k;
    return captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.keys.findIndex(findIndexCase16.bind(null, {
        idxComponentContext: idxComponentContext
    }));
}
