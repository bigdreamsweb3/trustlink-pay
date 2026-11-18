/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";

export function caseFundingEvidenceCompaction(compactAuthorizedFundingVerification, fundingNoteFixture, crankerExecutionPayload) {
    const payload = { paymentId: "p", recipientHash: "h", tokenMintAddress: "m", amount: 1 };
    const senderFundingBlockhashContext = { blockhash: "11111111111111111111111111111112", lastValidBlockHeight: 150, contextSlot: 0 };
    const compact = compactAuthorizedFundingVerification(payload, {
        verificationType: "TSN_TCAP_V2_GPRU_CREDIT_INTENT",
        verifiedPayload: {
            ...payload,
            recipientTin: "1234567890",
            senderAuthorizationMessage: "Recipient TIN: 1234567890",
            senderAuthorizationSignature: "signature",
            senderWallet: "wallet",
            senderSignedFundingTransaction: "signed-transaction",
            senderFundingMode: "tcap_funded_note_v1",
            senderFundingBlockhashContext,
            fundingNote: fundingNoteFixture,
            tcapCreditTransition: { nullifier: "private-transition-data" },
        },
    });
    assert.deepEqual(compact.payloadDelta, {
        addedFields: { senderSignedFundingTransaction: "signed-transaction", senderFundingMode: "tcap_funded_note_v1", senderFundingBlockhashContext },
        changedFields: {},
        removedFields: [],
    });
    assert.doesNotMatch(JSON.stringify(compact), /1234567890|senderAuthorization|senderWallet|tcapCreditTransition|fundingNote/);
    assert.deepEqual(crankerExecutionPayload("AUTHORIZED_FUNDING", { fundingNote: fundingNoteFixture, senderSignedFundingTransaction: "signed-transaction", senderFundingMode: "tcap_funded_note_v1", senderFundingBlockhashContext }), {
        senderSignedFundingTransaction: "signed-transaction", senderFundingMode: "tcap_funded_note_v1", senderFundingBlockhashContext,
    });
}
