import test from "node:test";
import assert from "node:assert/strict";
import {
  derivePrivacyReceivingRootCommitment,
  deriveDevnetTestPrivacyReceivingRootCommitment,
  deriveDevnetTestPolicyCommitment,
  deriveDevnetTestTcapGenesisCommitment,
} from "../dist/index.js";

test("privacy receiving-root commitment is deterministic and 32 bytes", async () => {
  const a = await derivePrivacyReceivingRootCommitment("11".repeat(32));
  const b = await derivePrivacyReceivingRootCommitment("11".repeat(32));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, "11".repeat(32));
});

test("controlled Devnet identity derivation is label-bound", async () => {
  const owner = "7vjGCdLddCx7W33q8fkjppWnhXZKkqZn9WcApsD6dLeb";
  const a = await deriveDevnetTestPrivacyReceivingRootCommitment(owner, "fixture-wallet-v1");
  const b = await deriveDevnetTestPrivacyReceivingRootCommitment(owner, "fixture-wallet-v1");
  const c = await deriveDevnetTestPrivacyReceivingRootCommitment(owner, "other-fixture-v1");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("root material must be nonempty hex", async () => {
  await assert.rejects(() => derivePrivacyReceivingRootCommitment("not-hex"), /privacy_receiving_root_material/);
});

test("Devnet policy and genesis commitments are deterministic and label-bound", async () => {
  const owner = "7vjGCdLddCx7W33q8fkjppWnhXZKkqZn9WcApsD6dLeb";
  const policy = await deriveDevnetTestPolicyCommitment(owner, "fixture-wallet-v1");
  const genesis = await deriveDevnetTestTcapGenesisCommitment(owner, policy, "fixture-wallet-v1");
  assert.equal(policy, await deriveDevnetTestPolicyCommitment(owner, "fixture-wallet-v1"));
  assert.equal(genesis, await deriveDevnetTestTcapGenesisCommitment(owner, policy, "fixture-wallet-v1"));
  assert.notEqual(policy, await deriveDevnetTestPolicyCommitment(owner, "other-fixture-v1"));
  assert.notEqual(genesis, "0".repeat(64));
});
