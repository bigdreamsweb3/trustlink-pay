/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { caseValidateSenderAuthorization } from "./validate-sender-authorization.mjs";
import { caseRejectInvalidSenderSignature } from "./reject-invalid-sender-signature.mjs";
import { caseRejectRetiredFundingMode } from "./reject-retired-funding-mode.mjs";
import { validateFundingNoteFixture } from "./validate-funding-note-fixture.mjs";
import { caseRejectExtraNoteOpeningField } from "./reject-extra-note-opening-field.mjs";
import { caseAcceptZeroNoteBlinding } from "./accept-zero-note-blinding.mjs";
import { caseRejectObsoleteFundingField } from "./reject-obsolete-funding-field.mjs";
export function caseSenderAuthorization(base58, fundingNoteFixture, assertAuthorizedFundingIngress) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const der = publicKey.export({ format: "der", type: "spki" });
    const wallet = base58(der.subarray(-32));
    const message = "TSN payment authorization";
    const payload = { paymentId: "p", recipientHash: "h", recipientTin: "1234567890", tokenMintAddress: "m", amount: 1, senderWallet: wallet, senderAuthorizationMessage: message, senderAuthorizationSignature: sign(null, Buffer.from(message), privateKey).toString("base64"), senderAuthorizationNonce: "n", senderFundingMode: "tcap_funded_note_v1", fundingNote: fundingNoteFixture, senderSignedFundingTransaction: "base64-serialized-owner-signed-transaction", senderFundingBlockhashContext: { blockhash: "11111111111111111111111111111112", lastValidBlockHeight: 150, contextSlot: 0 } };
    assert.doesNotThrow(caseValidateSenderAuthorization.bind(null, assertAuthorizedFundingIngress, payload));
    assert.throws(assertAuthorizedFundingIngress.bind(null, { ...payload, senderFundingBlockhashContext: undefined }), /SENDER_FUNDING_BLOCKHASH_CONTEXT_REQUIRED/);
    assert.throws(caseRejectInvalidSenderSignature.bind(null, assertAuthorizedFundingIngress, payload), /INVALID_SENDER_SIGNATURE/);
    assert.throws(caseRejectRetiredFundingMode.bind(null, assertAuthorizedFundingIngress, payload), /FUNDED_NOTE_FUNDING_MODE_REQUIRED/);
    for (const note of [undefined, null, [], "private"]) {
        assert.throws(validateFundingNoteFixture.bind(null, assertAuthorizedFundingIngress, payload, note), /FUNDED_NOTE_PRIVATE_OPENING_REQUIRED/);
    }
    const modulus = 21888242871839275222246405745257275088548364400416034343698204186575808495617n.toString(16).padStart(64, "0");
    for (const note of [
        { ...fundingNoteFixture, version: 2 }, { ...fundingNoteFixture, secret: "00".repeat(32) },
        { ...fundingNoteFixture, commitment: "00".repeat(32) }, { ...fundingNoteFixture, secret: modulus },
        { ...fundingNoteFixture, blinding: modulus }, { ...fundingNoteFixture, commitment: modulus },
        { ...fundingNoteFixture, secret: "ff" }, { ...fundingNoteFixture, blinding: 2 },
    ])
        assert.throws(validateFundingNoteFixture.bind(null, assertAuthorizedFundingIngress, payload, note), /INVALID_FUNDED_NOTE_PRIVATE_OPENING/);
    assert.throws(caseRejectExtraNoteOpeningField.bind(null, assertAuthorizedFundingIngress, payload, fundingNoteFixture), /UNSUPPORTED_PAYLOAD_FIELD:fundingNote.witness/);
    assert.doesNotThrow(caseAcceptZeroNoteBlinding.bind(null, assertAuthorizedFundingIngress, payload, fundingNoteFixture));
    for (const obsolete of ["pruSpendTin", "pruSpendSelections", "walletTopUpAmountBaseUnits", "privacyVersion", "senderTokenAccount", "encryptedSettlementToken"]) {
        assert.throws(caseRejectObsoleteFundingField.bind(null, assertAuthorizedFundingIngress, payload, obsolete), /UNSUPPORTED_PAYLOAD_FIELD/);
    }
}
