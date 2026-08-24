import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  assertEncryptedSnapshotOpaque,
  assertSnapshotMatchesTip,
  computeTcapBalanceSnapshotCommitment,
  decryptTcapBalanceSnapshotV1,
  decodeTcapBalanceSnapshotV1,
  encryptTcapBalanceSnapshotV1,
  importTcapSnapshotKey,
  readPrivateTcapBalance,
} from "../dist/index.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const zero = "0".repeat(64);
const base = {
  version: 1,
  sequence: 3n,
  previous_commitment: "11".repeat(32),
  new_commitment: zero,
  token_balances: [{ token_id: 7, native_amount: 123n, stable_units: 123n, stable_rate_version: 1 }],
  policy_commitment: "22".repeat(32),
  transition_nullifier: "33".repeat(32),
  tsn_settlement_commitment: "44".repeat(32),
  created_at: 1_725_000_000n,
  encrypted_record_locator: "enc:owner-store:v1:opaque",
};

async function snapshot() {
  const commitment = await computeTcapBalanceSnapshotCommitment(base);
  return { ...base, new_commitment: commitment };
}

test("snapshot hash matches the on-chain tip commitment", async () => {
  const value = await snapshot();
  assertSnapshotMatchesTip(value, { current_commitment: value.new_commitment, sequence: 3n });
});

test("wrong snapshot commitment and sequence are rejected", async () => {
  const value = await snapshot();
  assert.throws(() => assertSnapshotMatchesTip({ ...value, new_commitment: "aa".repeat(32) }, { current_commitment: value.new_commitment, sequence: 3n }), /snapshot_commitment_mismatch/);
  assert.throws(() => assertSnapshotMatchesTip(value, { current_commitment: value.new_commitment, sequence: 4n }), /snapshot_sequence_mismatch/);
});

test("private read returns balances only after local decryption", async () => {
  const value = await snapshot();
  const key = await importTcapSnapshotKey(new Uint8Array(32).fill(9));
  const envelope = await encryptTcapBalanceSnapshotV1(value, key);
  assertEncryptedSnapshotOpaque(envelope);
  assert.equal("token_balances" in envelope, false);
  const result = await readPrivateTcapBalance({
    fetchTip: async () => ({ current_commitment: value.new_commitment, sequence: value.sequence }),
    store: { load: async (commitment) => commitment === value.new_commitment ? envelope : null },
    key,
    decode: decodeTcapBalanceSnapshotV1,
  });
  assert.equal(result.snapshot.token_balances[0].native_amount, 123n);
});

test("tampered ciphertext cannot produce a private balance", async () => {
  const value = await snapshot();
  const key = await importTcapSnapshotKey(new Uint8Array(32).fill(7));
  const envelope = await encryptTcapBalanceSnapshotV1(value, key);
  const tampered = { ...envelope, ciphertext: new Uint8Array(envelope.ciphertext).map((byte, i) => i === 0 ? byte ^ 1 : byte) };
  await assert.rejects(() => decryptTcapBalanceSnapshotV1(tampered, key));
});
