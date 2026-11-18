/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";

export function caseInitialWorkState(createReceivedWork) {
    const work = createReceivedWork({
        id: "intent-1",
        kind: "AUTHORIZED_FUNDING",
        payload: { paymentId: "p", recipientHash: "h" },
    });
    assert.equal(work.status, "RECEIVED");
    assert.equal(work.stateVersion, 1);
    assert.match(work.payloadCommitment, /^[a-f0-9]{64}$/);
}
