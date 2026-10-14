import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import { deriveTcapTipRootCommitment } from "../dist/gpru.js";
import {
  buildTinV1Creation,
  createTinV1IdentityEnvelope,
  createTinV1OwnerIntentHash,
  serializeTinV1CreationParams,
} from "../dist/tins.js";

const digest = (...parts) => createHash("sha256").update(Buffer.concat(parts)).digest();
const fixed32 = (byte) => Buffer.alloc(32, byte);

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
    tcapRouteVersion: 1,
    tcapRelationshipCommitment: fixed32(10),
    tcapRelationshipReference: deriveTcapTipRootCommitment(fixed32(10)),
    tcapPolicyCommitment: fixed32(12),
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
      tcapPolicyCommitment: fixed32(13),
      intentHash: prepared.intentHash,
    }),
    /intentHash does not match CreateTinV1 payload/,
  );
});
