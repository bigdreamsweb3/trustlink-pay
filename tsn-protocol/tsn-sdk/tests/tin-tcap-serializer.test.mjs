import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import { serializeTinCreationRegistryParams } from "../dist/tins.js";

const base = {
  ownerPubkey: PublicKey.unique(),
  displayName: "devnet-tin",
  encryptedMasterSeed: Buffer.from("device-only-ciphertext"),
  tcapRouteVersion: 1,
  tcapRelationshipCommitment: Buffer.alloc(32, 1),
  tcapRelationshipReference: Buffer.alloc(32, 2),
  tcapPolicyCommitment: Buffer.alloc(32, 3),
  nonce: Buffer.alloc(32, 4),
  intentHash: Buffer.alloc(32, 5),
  expiryTs: 10n,
};

test("TSN SDK emits the complete TCap TIN mutation ABI", () => {
  const encoded = serializeTinCreationRegistryParams(base);
  assert.equal(encoded[0], 12);
  assert.ok(encoded.length > 250);
});

test("TSN SDK rejects legacy PRU material on the active TCap route", () => {
  assert.throws(
    () => serializeTinCreationRegistryParams({ ...base, pruConfigurationHash: Buffer.alloc(32, 9) }),
    /cannot include pruConfigurationHash/,
  );
  assert.throws(
    () => serializeTinCreationRegistryParams({ ...base, encryptedPublicRouteEnvelope: Buffer.from([1]) }),
    /cannot include encryptedPublicRouteEnvelope/,
  );
});
