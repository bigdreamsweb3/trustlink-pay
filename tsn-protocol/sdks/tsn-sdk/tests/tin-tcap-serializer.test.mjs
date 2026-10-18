import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { deriveGpruElgamalKeyCommitment } from "../dist/gpru.js";
import {
  serializeTinV1CreationChunkParams,
  serializeTinV1CreationCloseParams,
  serializeTinV1CreationFinalizeParams,
  serializeTinV1CreationStageParams,
} from "../dist/tins.js";

const fixed32 = (byte) => Buffer.alloc(32, byte);
const relationship = fixed32(1);
const intentHash = fixed32(4);
const stageParams = {
  ownerPubkey: Keypair.generate().publicKey,
  lookupCommitment: fixed32(2),
  intentHash,
  encryptedIdentityEnvelopeLength: 80,
  encryptedTinRecoveryLength: 96,
  encryptedMasterSeedLength: 320,
  encryptedMetadataHash: fixed32(3),
  routeVersion: 1,
  routeNonce: fixed32(5),
  tipRouteVersion: 1,
  gpruElgamalKeyVersion: 1,
  gpruElgamalPublicKey: relationship,
  gpruElgamalKeyCommitment: deriveGpruElgamalKeyCommitment(1, relationship),
  policyCommitment: fixed32(6),
  expiryTs: 1_900_000_000,
};

test("TIN V1 stage serializer matches the current bounded staging instruction", () => {
  const data = serializeTinV1CreationStageParams(stageParams);
  assert.equal(data[0], 19);
  assert.equal(data.length, 1 + 32 + 32 + 32 + 4 + 4 + 4 + 32 + 8 + 32 + 1 + 1 + 32 + 32 + 32 + 8);
  assert.throws(
    () => serializeTinV1CreationStageParams({
      ...stageParams,
      gpruElgamalKeyCommitment: fixed32(7),
    }),
    /valid versioned GPRU ElGamal key commitment/,
  );
});

test("TIN V1 chunks select only active encrypted blobs and retain byte offsets", () => {
  for (const [kind, tag] of [["identity", 0], ["master_seed", 1], ["owner_recovery", 3]]) {
    const data = serializeTinV1CreationChunkParams({ kind, offset: 700, bytes: Buffer.from([8, 9]) });
    assert.equal(data[0], 20);
    assert.equal(data[1], tag);
    assert.equal(data.readUInt32LE(2), 700);
    assert.equal(data.readUInt32LE(6), 2);
  }
  assert.throws(
    () => serializeTinV1CreationChunkParams({ kind: "identity", offset: -1, bytes: Buffer.from([1]) }),
    /non-negative safe integer/,
  );
});

test("TIN V1 stage finalization and expiry close use distinct instruction tags", () => {
  const finalize = serializeTinV1CreationFinalizeParams({ intentHash });
  const close = serializeTinV1CreationCloseParams({ intentHash });
  assert.equal(finalize[0], 21);
  assert.equal(close[0], 22);
  assert.deepEqual(finalize.subarray(1), close.subarray(1));
});
