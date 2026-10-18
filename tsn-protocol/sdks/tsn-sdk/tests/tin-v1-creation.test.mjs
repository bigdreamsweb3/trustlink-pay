import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { deriveGpruElgamalKeyCommitment } from "../dist/gpru.js";
import {
  buildTinV1Creation,
  buildTinV1OwnerRecoveryMessage,
  createTinV1IdentityEnvelope,
  createTinV1OwnerIntentHash,
  createTinV1OwnerRecoveryEnvelope,
  decryptTinV1OwnerRecoveryEnvelope,
  serializeTinV1CreationParams,
} from "../dist/tins.js";

const digest = (...parts) => createHash("sha256").update(Buffer.concat(parts)).digest();
const fixed32 = (byte) => Buffer.alloc(32, byte);

test("TIN V1 owner recovery is encrypted and decrypted only with the owner's wallet signature", async () => {
  const owner = Keypair.generate();
  const signature = nacl.sign.detached(
    buildTinV1OwnerRecoveryMessage(owner.publicKey),
    owner.secretKey,
  );
  const envelope = await createTinV1OwnerRecoveryEnvelope({
    tin: "1234567890",
    displayName: "Example Owner",
    owner: owner.publicKey,
    signature,
  });

  assert.equal(Buffer.from(envelope).subarray(0, 8).toString("ascii"), "TSNTIN04");
  assert.deepEqual(
    await decryptTinV1OwnerRecoveryEnvelope({
      encryptedEnvelope: envelope,
      owner: owner.publicKey,
      signature,
    }),
    { tin: "1234567890", displayName: "Example Owner" },
  );
  await assert.rejects(
    decryptTinV1OwnerRecoveryEnvelope({
      encryptedEnvelope: envelope,
      owner: Keypair.generate().publicKey,
      signature,
    }),
    /TIN_OWNER_RECOVERY_SIGNATURE_INVALID/,
  );
  await assert.rejects(
    createTinV1OwnerRecoveryEnvelope({
      tin: "123",
      displayName: "Example Owner",
      owner: owner.publicKey,
      signature,
    }),
    /TIN_OWNER_RECOVERY_TIN_INVALID/,
  );
});


test("TIN V1 requires a high-entropy resolver secret and derives its PDA commitment from it", async () => {
  await assert.rejects(
    createTinV1IdentityEnvelope({ tin: "1234567890", displayName: "Example" }),
    /lookupSecret/,
  );
  await assert.rejects(
    createTinV1IdentityEnvelope({ tin: "1234567890", displayName: "Example", lookupSecret: "1234567890" }),
    /at least 16 bytes/,
  );

  const lookupSecret = "a-protected-resolver-secret-with-32-bytes";
  const identity = await createTinV1IdentityEnvelope({ tin: "1234567890", displayName: "Example", lookupSecret });
  const expectedCommitment = digest(
    Buffer.from("TSN_TIN_V1_LOOKUP", "utf8"),
    Buffer.from(lookupSecret, "utf8"),
    Buffer.from("1234567890", "utf8"),
  );
  assert.deepEqual(Buffer.from(identity.lookupCommitment), expectedCommitment);
  const otherIdentity = await createTinV1IdentityEnvelope({ tin: "1234567890", displayName: "Example", lookupSecret: `${lookupSecret}!` });
  assert.notDeepEqual(Buffer.from(otherIdentity.lookupCommitment), expectedCommitment);
});

test("TIN V1 SDK builder, serializer, and canonical hash agree on all TCap fields", () => {
  const ownerPubkey = Keypair.generate().publicKey;
  const params = {
    ownerPubkey,
    displayName: "Example TIN",
    lookupCommitment: fixed32(1),
    encryptedTinRecovery: Buffer.from([0]),
    encryptedIdentityEnvelope: Buffer.from([1, 2, 3, 4]),
    encryptedMasterSeed: Buffer.from([5, 6, 7]),
    encryptedMetadataHash: fixed32(8),
    routeVersion: 1,
    routeNonce: fixed32(9),
    nonce: fixed32(9),
    tipRouteVersion: 1,
    gpruElgamalKeyVersion: 1,
    gpruElgamalPublicKey: fixed32(10),
    gpruElgamalKeyCommitment: deriveGpruElgamalKeyCommitment(1, fixed32(10)),
    policyCommitment: fixed32(12),
    expiryTs: 1_900_000_000,
  };
  const prepared = buildTinV1Creation(params);
  assert.deepEqual(
    prepared.intentHash,
    createTinV1OwnerIntentHash({
      ...params,
      encryptedMetadataHash: params.encryptedMetadataHash,
      routeNonce: params.routeNonce,
    }),
  );
  assert.equal(prepared.instructionData[0], 17);
  assert.deepEqual(
    Buffer.from(prepared.instructionData),
    Buffer.from(serializeTinV1CreationParams({ ...prepared, intentHash: prepared.intentHash })),
  );
  assert.throws(
    () => serializeTinV1CreationParams({
      ...prepared,
      policyCommitment: fixed32(13),
      intentHash: prepared.intentHash,
    }),
    /intentHash does not match CreateTinV1 payload/,
  );
});
