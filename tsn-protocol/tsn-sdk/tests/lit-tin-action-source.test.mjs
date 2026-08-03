import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("../lit-actions/tin-threshold-key-action.js", import.meta.url), "utf8");

test("immutable action consumes a signed nonce receipt before PKP access", () => {
  const consume = source.indexOf("fetch(replayEndpoint");
  const verify = source.indexOf("await verifyReceipt");
  const encrypt = source.indexOf("Lit.Actions.Encrypt");
  const decrypt = source.indexOf("Lit.Actions.Decrypt");
  assert.ok(consume >= 0 && verify > consume);
  assert.ok(encrypt > verify && decrypt > verify);
});

test("immutable action never accepts or returns a TIN master seed", () => {
  assert.equal(/masterSeed|seedCiphertext|secretKeyBase64|mnemonic/.test(source), false);
  assert.match(source, /keyMaterial\.fill\(0\)/);
  assert.match(source, /wrapForDevice/);
});

test("immutable action pins exact Node receipt verification", () => {
  assert.match(source, /TSN_TIN_THRESHOLD_NONCE_RECEIPT/);
  assert.match(source, /receipt\.verifierPublicKeyBase64Url !== expectedVerifier/);
  assert.match(source, /crypto\.subtle\.verify\("Ed25519"/);
});

test("release recomputes the owner, resource, and PKP access policy", () => {
  assert.match(source, /expectedAccessControlHash/);
  assert.match(source, /request\.accessControlHash\.toLowerCase\(\)/);
  assert.match(source, /Protected TIN data-key access policy is invalid/);
});
