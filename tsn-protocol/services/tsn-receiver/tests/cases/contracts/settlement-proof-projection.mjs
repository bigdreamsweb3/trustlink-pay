/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";

export function caseSettlementProofProjection(fundingNoteFixture, crankerExecutionPayload) {
    const transition = {
        proof: { publicInputs: ["public"], fundingNote: fundingNoteFixture, secret: "private" }, fundingRootAccount: "public-root-account", memoPayload: "prefix:body", memoBodyPayload: "body", memoLedgerSlots: ["body"],
        fundingNote: fundingNoteFixture, fundingCommitment: "private", fundingSiblings: ["private"],
        accountSiblings: ["private"], accountPathKey: "private", priorSequence: "private", balanceBlindingDelta: "private",
        previousMemoCommitment: "private", recipientTin: "private", sequence: "private", witness: { secret: "private" },
    };
    assert.deepEqual(crankerExecutionPayload("SETTLEMENT", { tcapCreditTransition: transition }), {
        tcapCreditTransition: { proof: { publicInputs: ["public"] }, fundingRootAccount: "public-root-account", memoPayload: "prefix:body", memoBodyPayload: "body", memoLedgerSlots: ["body"] },
    });
}
