import test from "node:test";
import assert from "node:assert/strict";
import {
  allocatePrusDeterministically,
  computePruConfigurationHash,
  computeTinBalance,
  derivePruSet,
  planPruSweep,
  pruCountForPrivacyLevel,
  selectPrusForSpend,
} from "../dist/index.js";

test("privacy levels map to deterministic PRU counts", () => {
  assert.equal(pruCountForPrivacyLevel(1), 3);
  assert.equal(pruCountForPrivacyLevel(2), 10);
  assert.equal(pruCountForPrivacyLevel(3), 30);
  assert.equal(pruCountForPrivacyLevel(4), 100);
});

test("PRU derivation and configuration commitments are stable", () => {
  const first = derivePruSet({ masterSeed: "seed", tinId: "1234567890", tokenMint: "USDC", privacyLevel: 2 });
  const second = derivePruSet({ masterSeed: "seed", tinId: "1234567890", tokenMint: "USDC", privacyLevel: 2 });
  assert.deepEqual(first, second);
  assert.equal(computePruConfigurationHash(first), computePruConfigurationHash(second));
});

test("deterministic allocation replays exactly and conserves amount", () => {
  const pruSet = derivePruSet({ masterSeed: "seed", tinId: "1234567890", tokenMint: "USDC", privacyLevel: 1, initialState: "ACTIVE" });
  const input = { txId: "tx-001", tinId: "1234567890", tokenMint: "USDC", pruSet, amount: 1001n };
  const first = allocatePrusDeterministically(input);
  const second = allocatePrusDeterministically(input);
  assert.deepEqual(first, second);
  assert.equal(first.reduce((sum, row) => sum + row.amount, 0n), 1001n);
});

test("3-state accounting and deterministic spend/sweep planning use unified TIN balance", () => {
  const pruSet = derivePruSet({ masterSeed: "seed", tinId: "1234567890", tokenMint: "USDC", privacyLevel: 1, initialState: "USED" });
  const balances = [
    { pru: pruSet[0], available: 5n, pending: 1n, settled: 10n },
    { pru: pruSet[1], available: 7n, pending: 0n, settled: 0n },
    { pru: { ...pruSet[2], state: "SWEPT" }, available: 9n, pending: 0n, settled: 0n },
  ];
  assert.deepEqual(computeTinBalance(balances), { available: 21n, pending: 1n, settled: 10n, final: 30n });
  assert.deepEqual(selectPrusForSpend({ balances, amount: 12n }).map((entry) => entry.amount), [12n]);
  assert.deepEqual(planPruSweep(balances).map((entry) => entry.amount), [14n, 7n]);
});
