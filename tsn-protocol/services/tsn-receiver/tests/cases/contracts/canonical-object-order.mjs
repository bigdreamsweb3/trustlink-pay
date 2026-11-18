/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";

export function caseCanonicalObjectOrder(createReceivedWork) {
    const first = createReceivedWork({ kind: "SETTLEMENT", payload: { paymentId: "p", intentId: "i", recipientHash: "h", source: "test" } });
    const second = createReceivedWork({ kind: "SETTLEMENT", payload: { source: "test", recipientHash: "h", intentId: "i", paymentId: "p" } });
    assert.equal(first.payloadCommitment, second.payloadCommitment);
}
