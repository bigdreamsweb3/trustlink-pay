import assert from "node:assert/strict";
import test from "node:test";
import {
  computeTsnDomain,
  createScopedPruIntent,
  generateTinMasterSeed,
} from "../dist/pru.js";
import { validatePruSpendForCranker } from "../dist/payment-authorization-server.js";

test("TIN Master Seed is CSPRNG material unrelated to wallet signatures", () => {
  const a = generateTinMasterSeed((size) => new Uint8Array(size).fill(7));
  const b = generateTinMasterSeed((size) => new Uint8Array(size).fill(8));
  assert.equal(a.length, 32);
  assert.equal(Buffer.from(a).equals(Buffer.from(b)), false);
});

test("scoped PRU intent is domain-bound, single-use, nonce-bound, expiring, and active-guarded", () => {
  const seed = generateTinMasterSeed((size) => new Uint8Array(size).fill(3));
  const intent = createScopedPruIntent({
    tinMasterSeed: seed,
    tsnVaultPubkey: "RealTrustLinkVault111111111111111111111111",
    tin: "1234567890",
    pruIndex: 4,
    amount: 42n,
    recipientTin: "5555555555",
    intentId: "intent-1",
    nonce: 5,
    nowUnixSeconds: 1000,
  });
  assert.equal(intent.message.tsn_domain, computeTsnDomain("RealTrustLinkVault111111111111111111111111"));
  const guard = { tin: "1234567890", pruIndex: 4, nonceBitmask: new Uint8Array(32), active: true };
  assert.equal(validatePruSpendForCranker({
    intent,
    tsnVaultPubkey: "RealTrustLinkVault111111111111111111111111",
    mainWalletSpendProofVerified: true,
    identityBindingMainWallet: "owner",
    pruSpendGuard: guard,
    seenIntentIds: new Set(),
    nowUnixSeconds: 1001,
  }), true);
  assert.throws(() => validatePruSpendForCranker({ intent, tsnVaultPubkey: "FakeVault", mainWalletSpendProofVerified: true, identityBindingMainWallet: "owner", pruSpendGuard: guard, seenIntentIds: new Set(), nowUnixSeconds: 1001 }), /domain/i);
  assert.throws(() => validatePruSpendForCranker({ intent, tsnVaultPubkey: "RealTrustLinkVault111111111111111111111111", mainWalletSpendProofVerified: false, identityBindingMainWallet: "owner", pruSpendGuard: guard, seenIntentIds: new Set(), nowUnixSeconds: 1001 }), /Main wallet/i);
  assert.throws(() => validatePruSpendForCranker({ intent, tsnVaultPubkey: "RealTrustLinkVault111111111111111111111111", mainWalletSpendProofVerified: true, identityBindingMainWallet: "owner", pruSpendGuard: { ...guard, tin: "999" }, seenIntentIds: new Set(), nowUnixSeconds: 1001 }), /Cross-TIN/i);
  assert.throws(() => validatePruSpendForCranker({ intent, tsnVaultPubkey: "RealTrustLinkVault111111111111111111111111", mainWalletSpendProofVerified: true, identityBindingMainWallet: "owner", pruSpendGuard: guard, seenIntentIds: new Set(["intent-1"]), nowUnixSeconds: 1001 }), /intent_id/i);
  const replayMask = new Uint8Array(32); replayMask[0] = 1 << 5;
  assert.throws(() => validatePruSpendForCranker({ intent, tsnVaultPubkey: "RealTrustLinkVault111111111111111111111111", mainWalletSpendProofVerified: true, identityBindingMainWallet: "owner", pruSpendGuard: { ...guard, nonceBitmask: replayMask }, seenIntentIds: new Set(), nowUnixSeconds: 1001 }), /nonce/i);
  assert.throws(() => validatePruSpendForCranker({ intent, tsnVaultPubkey: "RealTrustLinkVault111111111111111111111111", mainWalletSpendProofVerified: true, identityBindingMainWallet: "owner", pruSpendGuard: guard, seenIntentIds: new Set(), nowUnixSeconds: 1061 }), /Expired/i);
  assert.throws(() => validatePruSpendForCranker({ intent, tsnVaultPubkey: "RealTrustLinkVault111111111111111111111111", mainWalletSpendProofVerified: true, identityBindingMainWallet: "owner", pruSpendGuard: { ...guard, active: false }, seenIntentIds: new Set(), nowUnixSeconds: 1001 }), /Inactive/i);
});
