import assert from "node:assert/strict";
import test from "node:test";
import { decodeTinAccount, validateTinTcapRelationship } from "../dist/tins.js";

function buildTcapTinAccount() {
  const name = Buffer.from("devnet-tin");
  const seedEnvelope = Buffer.from("tsn-device-envelope-v1:ciphertext");
  const hash = (byte) => Buffer.alloc(32, byte);
  const data = Buffer.alloc(8 + 4 + name.length + 32 + 4 + seedEnvelope.length + 8 + 32 + 32 + 4 + 8 + 32 + 1 + 32 + 32 + 32);
  let offset = 0;
  data.writeBigUInt64LE(1234567890n, offset); offset += 8;
  data.writeUInt32LE(name.length, offset); offset += 4;
  name.copy(data, offset); offset += name.length;
  hash(1).copy(data, offset); offset += 32;
  data.writeUInt32LE(seedEnvelope.length, offset); offset += 4;
  seedEnvelope.copy(data, offset); offset += seedEnvelope.length;
  data.writeBigInt64LE(1n, offset); offset += 8;
  hash(2).copy(data, offset); offset += 32;
  Buffer.alloc(32).copy(data, offset); offset += 32;
  data.writeUInt32LE(0, offset); offset += 4;
  data.writeBigUInt64LE(7n, offset); offset += 8;
  hash(3).copy(data, offset); offset += 32;
  data.writeUInt8(1, offset); offset += 1;
  hash(4).copy(data, offset); offset += 32;
  hash(5).copy(data, offset); offset += 32;
  hash(6).copy(data, offset);
  return { data, seedEnvelope };
}

test("TCap TIN decoding consumes zero-length PRU envelope and preserves relationship commitments", () => {
  const { data, seedEnvelope } = buildTcapTinAccount();
  const decoded = decodeTinAccount(data);
  assert.equal(decoded.tcapRouteVersion, 1);
  assert.equal(decoded.routeVersion, 7n);
  assert.equal(decoded.encryptedPublicRouteEnvelope?.length ?? 0, 0);
  assert.deepEqual(decoded.encryptedMasterSeed, seedEnvelope);
  assert.equal(decoded.tcapRelationshipCommitment[0], 4);
  assert.equal(decoded.tcapRelationshipReference[0], 5);
  assert.equal(decoded.tcapPolicyCommitment[0], 6);
});

test("TCap route validation rejects PRU material and accepts commitments only", () => {
  const valid = {
    tcapRouteVersion: 1,
    pruConfigurationHash: new Uint8Array(32),
    encryptedPublicRouteEnvelope: new Uint8Array(),
    tcapRelationshipCommitment: new Uint8Array(32).fill(1),
    tcapRelationshipReference: new Uint8Array(32).fill(2),
    tcapPolicyCommitment: new Uint8Array(32).fill(3),
  };
  assert.equal(validateTinTcapRelationship(valid), true);
  assert.equal(validateTinTcapRelationship({ ...valid, encryptedPublicRouteEnvelope: new Uint8Array([1]) }), false);
  assert.equal(validateTinTcapRelationship({ ...valid, pruConfigurationHash: new Uint8Array(32).fill(9) }), false);
  assert.equal(validateTinTcapRelationship({ ...valid, tcapRelationshipReference: new Uint8Array(32) }), false);
});
