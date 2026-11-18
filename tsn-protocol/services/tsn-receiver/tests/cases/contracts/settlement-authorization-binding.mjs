/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { caseRejectChangedVerifiedTransition } from "./reject-changed-verified-transition.mjs";
import { caseRejectUnverifiedTransition } from "./reject-unverified-transition.mjs";
export function caseSettlementAuthorizationBinding(createReceivedWork, fundingNoteFixture, crankerAuthorizationForWork) {
    const transition = { proof: { publicInputs: Array(13).fill("public") }, fundingRootAccount: "public-root-account", tokenId: 1 };
    const work = { ...createReceivedWork({ kind: "SETTLEMENT", payload: { intentId: "funding" } }), verification: { verifiedPayload: { tcapCreditTransition: transition } } };
    const authorization = { kind: "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3", leaseId: "lease", leaseVersion: 3,
        transition: { ...transition, fundingNote: fundingNoteFixture, proof: { ...transition.proof, secret: "private" } }, fundingNote: fundingNoteFixture };
    const sanitized = crankerAuthorizationForWork(work, authorization);
    assert.deepEqual(sanitized, { kind: authorization.kind, leaseId: "lease", leaseVersion: 3, transition });
    assert.doesNotMatch(JSON.stringify(sanitized), /fundingNote|secret|blinding/);
    for (const changed of [{ ...transition, tokenId: 2 }, { ...transition, fundingRootAccount: "another-root" }, { ...transition, proof: { publicInputs: Array(12).fill("public") } }]) {
        assert.throws(caseRejectChangedVerifiedTransition.bind(null, crankerAuthorizationForWork, work, authorization, changed), /TRANSITION_MISMATCH/);
    }
    assert.throws(caseRejectUnverifiedTransition.bind(null, crankerAuthorizationForWork, work, authorization), /TRANSITION_MISMATCH/);
}
