import assert from "node:assert/strict";

export async function fixtureCallback(captures, url, init) {
    assert.equal(String(url), "https://offline.invalid");
    const b = JSON.parse(init.body);
    captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.calls++;
    assert.ok(["getTransaction", "getAccountInfo"].includes(b.method), "receipt repair has no mutating RPC methods");
    const result = b.method === "getTransaction" ? (b.params[0] === captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.signature ? captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.receipt : { meta: { err: null } }) : { value: b.params[0] === captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.t.commitmentRoot ? captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.root : captures.verifyFinalizedReceiptRepairPreservesFundingRejectsMismatchesAndWakesOnlyContext.mother };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: b.id, result }));
}
