/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";

export function casePublicEnvelopeExclusion(createReceivedWork, publicCoordinationPayload) {
    const work = createReceivedWork({ kind: "AUTHORIZED_FUNDING", payload: { paymentId: "p", recipientHash: "h", nodeEncryptedPayload: { version: 1, iv: "i", ciphertext: "c", tag: "t" } } });
    assert.deepEqual(publicCoordinationPayload(work), { paymentId: "p", recipientHash: "h" });
}
