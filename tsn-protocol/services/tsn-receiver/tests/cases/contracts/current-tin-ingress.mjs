/** Isolated test component; lexical state is supplied explicitly by its enclosing fixture. */
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { caseRejectObsoleteTinField } from "./reject-obsolete-tin-field.mjs";
export function caseCurrentTinIngress(createReceivedWork) {
    const payload = {
        intentType: "tin_creation",
        intentId: "operation-1",
        ownerPubkey: "owner",
        ownerSignature: "signature",
        ownerIntentHash: "hash",
        ownerIntentMessage: "approval",
        nonce: "nonce",
        expiry: 1,
        lookupCommitment: "commitment",
        lookupIssuanceProof: "proof",
        encryptedIdentityEnvelope: "identity",
        encryptedTinRecovery: "recovery",
        encryptedMasterSeed: "seed",
        encryptedMetadataHash: "metadata",
        routeVersion: 1,
        routeNonce: "route-nonce",
        tipRouteVersion: 1,
        gpruElgamalKeyVersion: 1,
        gpruElgamalPublicKey: "gpru-elgamal-public-key",
        gpruElgamalKeyCommitment: "gpru-elgamal-commitment",
        policyCommitment: "policy",
    };
    assert.equal(createReceivedWork({ kind: "TIN_OPERATION", payload }).status, "RECEIVED");
    for (const obsolete of ["programAssigned", "tin", "displayName", "pruConfigurationHash", "encryptedPublicRouteEnvelope"]) {
        assert.throws(caseRejectObsoleteTinField.bind(null, createReceivedWork, payload, obsolete), /UNSUPPORTED_PAYLOAD_FIELD/);
    }
}
