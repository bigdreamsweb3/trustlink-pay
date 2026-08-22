import assert from "node:assert/strict";
import test from "node:test";
import nacl from "tweetnacl";
import {
  createCanonicalGpruAuthorizationMessage,
  deriveGpruIdentity,
  verifyGpruAuthorizationBinding,
  verifyGpruAuthorizationSignature,
} from "../dist/gpru.js";

const input = {
  tinPrivacyReceivingRoot: new Uint8Array(32).fill(1),
  settlementCommitment: new Uint8Array(32).fill(2),
  epochContext: new Uint8Array([3, 4]),
  authorizationScope: new Uint8Array([5, 6]),
};

test("GPRU derivation is domain-separated and binds all settlement context", () => {
  const identity = deriveGpruIdentity(input);
  assert.equal(identity.length, 32);
  assert.notDeepEqual(identity, deriveGpruIdentity({ ...input, authorizationScope: new Uint8Array([5, 7]) }));
  assert.equal(verifyGpruAuthorizationBinding({ ...input, gpruIdentity: identity }), true);
});

test("canonical GPRU authorization message verifies only its bound identity and signature", () => {
  const signer = nacl.sign.keyPair();
  const gpruIdentity = deriveGpruIdentity(input);
  const authorization = { ...input, gpruIdentity };
  const signature = nacl.sign.detached(createCanonicalGpruAuthorizationMessage(authorization), signer.secretKey);
  assert.equal(verifyGpruAuthorizationSignature({ ...authorization, signature, authorizationPublicKey: signer.publicKey }), true);
  assert.equal(verifyGpruAuthorizationSignature({ ...authorization, signature, authorizationPublicKey: signer.publicKey, epochContext: new Uint8Array([9]) }), false);
});
