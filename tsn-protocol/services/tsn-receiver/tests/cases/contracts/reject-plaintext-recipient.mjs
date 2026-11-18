/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";

export function caseRejectPlaintextRecipient(createReceivedWork) {
    return createReceivedWork({
        kind: "AUTHORIZED_FUNDING",
        payload: { paymentId: "p", recipientHash: "h", recipientTin: "1234567890" },
    });
}
