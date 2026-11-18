import { json } from "./json.mjs";

export function requestComponent(captures, key, body = { id: captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.id, expectedVersion: 28, signature: captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature, execute: false }) {
    const requestComponentContext = {};
    requestComponentContext.body = body;
    return ({ headers: new Headers({ "x-api-key": key }), json: json.bind(null, {
            requestComponentContext: requestComponentContext
        }) });
}
