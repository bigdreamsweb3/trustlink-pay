/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { caseRejectChangedCoordinationAsset } from "./reject-changed-coordination-asset.mjs";
export function caseAccountingProofProjection(crankerExecutionPayload, crankerAuthorizationForWork) {
    for (const [kind, field, publicValue] of [["TCAP_EPOCH_ACCOUNTING", "tcapEpochAccounting", { assetEntry: "asset", reserveState: "reserve", tcapConfig: "config", accountingEpoch: "epoch", total: "100", proof: { publicInputs: ["1"], proofA: "a", proofB: "b", proofC: "c" } }]]) {
        const privateValue = { ...publicValue, amounts: [50, 50], blindings: ["secret"], sourceWallets: ["private"] };
        if (privateValue.proof)
            privateValue.proof = { ...privateValue.proof, openings: ["secret"] };
        assert.deepEqual(crankerExecutionPayload(kind, { [field]: privateValue }), { [field]: publicValue });
        const work = { kind, verification: { verifiedPayload: { [field]: privateValue } } };
        const result = crankerAuthorizationForWork(work, { kind: "TSN_TCAP_COORDINATION_AUTHORIZATION_V1", transition: privateValue });
        assert.deepEqual(result.transition, publicValue);
        assert.throws(caseRejectChangedCoordinationAsset.bind(null, crankerAuthorizationForWork, work, publicValue), /AUTHORIZATION_MISMATCH/);
    }
}
