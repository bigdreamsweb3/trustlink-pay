import test from "node:test";
import assert from "node:assert/strict";
import {
  allocatePrusDeterministically,
  computePruConfigurationHash,
  computeTinBalance,
  derivePruSet,
  planLazyAtaCreation,
  planPruSweep,
  pruCountForPrivacyLevel,
  selectPrusForSpend,
  selectRandomPruForSpend,
} from "../dist/index.js";

test("every TIN gets 30 token-agnostic PRUs by default", () => {
  assert.equal(pruCountForPrivacyLevel(1), 30);
  assert.equal(pruCountForPrivacyLevel(2), 30);
  assert.equal(pruCountForPrivacyLevel(3), 30);
  assert.equal(pruCountForPrivacyLevel(4), 30);
});

test("PRU derivation and configuration commitments are token-agnostic and stable", () => {
  const first = derivePruSet({ masterSeed: "seed", tinId: "1234567890", privacyLevel: 2 });
  const second = derivePruSet({ masterSeed: "seed", tinId: "1234567890", privacyLevel: 4 });
  assert.equal(first.length, 30);
  assert.deepEqual(first, second);
  assert.equal(computePruConfigurationHash(first), computePruConfigurationHash(second));
});

test("deterministic allocation replays exactly per token and conserves amount", () => {
  const pruSet = derivePruSet({ masterSeed: "seed", tinId: "1234567890", initialState: "ACTIVE" });
  const input = { txId: "tx-001", tinId: "1234567890", tokenMint: "USDC", pruSet, amount: 1001n };
  const first = allocatePrusDeterministically(input);
  const second = allocatePrusDeterministically(input);
  assert.deepEqual(first, second);
  assert.equal(first.reduce((sum, row) => sum + row.amount, 0n), 1001n);
  assert.ok(first.every((row) => row.tokenMint === "USDC"));
});

test("lazy ATA planning subsidizes early token activation then charges activation fee", () => {
  const pruSet = derivePruSet({ masterSeed: "seed", tinId: "1234567890" });
  const allocation = allocatePrusDeterministically({ txId: "tx-002", tinId: "1234567890", tokenMint: "BONK", pruSet, amount: 3n });
  const planned = planLazyAtaCreation({
    allocation,
    lifecycle: [{ tinId: "1234567890", tokenMint: "BONK", pruIndex: allocation[0].pru.index, state: "PLANNED", ataCreated: false, ataRentSubsidiesUsed: 3, updatedAt: new Date(0).toISOString() }],
  });
  assert.equal(planned[0].ataAction, "activation_fee");
});

test("3-state accounting and randomized signing use unified TIN balance", () => {
  const pruSet = derivePruSet({ masterSeed: "seed", tinId: "1234567890", initialState: "USED" });
  const balances = [
    { pru: pruSet[0], tokenMint: "USDC", available: 5n, pending: 1n, settled: 10n },
    { pru: pruSet[1], tokenMint: "USDC", available: 7n, pending: 0n, settled: 0n },
    { pru: { ...pruSet[2], state: "SWEPT" }, tokenMint: "USDC", available: 9n, pending: 0n, settled: 0n },
  ];
  assert.deepEqual(computeTinBalance(balances, "USDC"), { available: 21n, pending: 1n, settled: 10n, final: 30n });
  const signingPru = selectRandomPruForSpend({ balances, tokenMint: "USDC", randomBytesFn: () => new Uint8Array(8) });
  assert.equal(signingPru.index, 0);
  assert.deepEqual(selectPrusForSpend({ balances, tokenMint: "USDC", amount: 12n, signingPru }).map((entry) => entry.amount), [12n]);
  assert.deepEqual(planPruSweep(balances, "USDC").map((entry) => entry.amount), [14n, 7n]);
});
