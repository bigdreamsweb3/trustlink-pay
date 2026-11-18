/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";

export function caseCompactAndLegacyRecords(createReceivedWork, compactVerificationPayload, verifiedPayloadForWork) {
    const payload = { paymentId: "payment", intentId: "funding", source: "old" };
    const verifiedPayload = { paymentId: "payment", intentId: "funding", recipientHash: "recipient", tokenMintAddress: "mint" };
    const original = createReceivedWork({ id: "settlement", kind: "SETTLEMENT", payload });
    const compact = compactVerificationPayload(payload, { verificationType: "existing", verifiedPayload });
    assert.deepEqual(verifiedPayloadForWork({ ...original, verification: compact }), verifiedPayload);
    assert.equal(verifiedPayloadForWork({ ...original, verification: { verifiedPayload } }), verifiedPayload);
    assert.deepEqual(payload, { paymentId: "payment", intentId: "funding", source: "old" });
}
