/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";

export function caseLegacyPublicProjection(createReceivedWork, publicCoordinationPayload) {
    const work = createReceivedWork({ kind: "AUTHORIZED_FUNDING", payload: { paymentId: "p", recipientHash: "h" } });
    const legacyWork = {
        ...work,
        verification: { verifiedPayload: { paymentId: "p", recipientHash: "h", recipientTin: "1234567890", privacyVersion: 1 } },
    };
    assert.deepEqual(publicCoordinationPayload(legacyWork), { paymentId: "p", recipientHash: "h" });
}
