/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { caseRejectPlaintextRecipient } from "./reject-plaintext-recipient.mjs";
import { caseRejectPlaintextFundedNote } from "./reject-plaintext-funded-note.mjs";
export function caseFundingPrivateFields(createReceivedWork, fundingNoteFixture) {
    assert.throws(caseRejectPlaintextRecipient.bind(null, createReceivedWork), /UNSUPPORTED_PAYLOAD_FIELD/);
    assert.throws(caseRejectPlaintextFundedNote.bind(null, createReceivedWork, fundingNoteFixture), /UNSUPPORTED_PAYLOAD_FIELD/);
}
