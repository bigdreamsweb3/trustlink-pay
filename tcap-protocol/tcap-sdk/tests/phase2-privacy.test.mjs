import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  NullifierRegistry,
  RejectingProofVerifier,
  TCAP_DOMAINS,
  assertAtomicFundingPlan,
  assertPaymentIntentV2DataOnly,
  assertReserveState,
  assertSettlementBoundary,
  assertTsnFeeReserveBacked,
  buildDeterministicRoot,
} from "../dist/index.js";

const digest = "11".repeat(32);
const commitment = "22".repeat(32);
const nullifier = "33".repeat(32);
const address = "11111111111111111111111111111111";
const asset = {
  tokenProgram: "TokenProgram1111111111111111111111111111",
  mint: "Mint111111111111111111111111111111111",
  registryVersion: 1,
  assetCommitment: commitment,
};

const rejectingProof = {
  kind: "public-settlement",
  system: "unselected",
  circuitVersion: 0,
  bytes: new Uint8Array(),
};

test("every cryptographic object class has a distinct domain", () => {
  assert.equal(new Set(Object.values(TCAP_DOMAINS)).size, Object.values(TCAP_DOMAINS).length);
});

test("public settlement request has no payer, intent, pending liability or funding reference", () => {
  const request = {
    version: 1,
    epochId: 7n,
    acceptedEpochRoot: digest,
    previousTcapRoot: digest,
    settlementNullifier: nullifier,
    asset,
    publicRecipientTokenAccount: address,
    publicAmount: 10n,
    proof: rejectingProof,
  };
  assert.doesNotThrow(() => assertSettlementBoundary(request));
  for (const forbidden of ["payerWallet", "payerTokenAccount", "paymentIntentPda", "pendingLiabilityPda", "fundingTransaction"]) {
    assert.equal(forbidden in request, false);
  }
});

test("confidential settlement request has no public sender or recipient container", () => {
  const request = {
    version: 1,
    epochId: 7n,
    acceptedEpochRoot: digest,
    previousTcapRoot: digest,
    settlementNullifier: nullifier,
    encryptedRecipientOutput: "ciphertext",
    recipientOutputCommitment: commitment,
    encryptedChangeOutput: null,
    changeOutputCommitment: null,
    nextTcapRoot: digest,
    proof: { ...rejectingProof, kind: "confidential-settlement" },
  };
  assert.doesNotThrow(() => assertSettlementBoundary(request));
  assert.equal("senderContainer" in request, false);
  assert.equal("recipientContainer" in request, false);
});

test("runtime guard rejects an injected sender-linked field", () => {
  assert.throws(
    () => assertSettlementBoundary({ paymentIntentPda: address }),
    /forbidden_settlement_field:paymentIntentPda/,
  );
});

test("PaymentIntentV2 is data-only and contains no reimbursement or custody field", () => {
  const intent = {
    version: 2,
    canonicalIntentDigest: digest,
    fundedCommitmentReference: digest,
    payerAuthorizationCommitment: commitment,
    recipientRouteCommitment: commitment,
    asset,
    amountCommitment: commitment,
    settlementFeeCommitment: commitment,
    protocolFeeCommitment: commitment,
    expiryUnixSeconds: 10n,
    nonceCommitment: commitment,
    replayProtectionCommitment: commitment,
    refundPolicyCommitment: commitment,
    settlementConditionsCommitment: commitment,
    epochAssignmentCommitment: null,
    pendingLiabilityCommitment: commitment,
    proofDomainVersion: 1,
    status: "funded",
  };
  assert.doesNotThrow(() => assertPaymentIntentV2DataOnly(intent));
  assert.equal("tokenBalance" in intent, false);
  assert.equal("reimbursed" in intent, false);
});

test("duplicate nullifier is rejected", () => {
  const registry = new NullifierRegistry();
  registry.consume(nullifier);
  assert.throws(() => registry.consume(nullifier), /nullifier_already_consumed/);
});

test("invalid nullifier encoding is rejected and SDK exposes no reverse mapping", () => {
  const registry = new NullifierRegistry();
  assert.throws(() => registry.consume("payer:intent:1"), /invalid_nullifier_encoding/);
  assert.equal("reverse" in registry, false);
});

test("deterministic root builder rejects duplicate epoch leaves", async () => {
  const hash = async (input) => new Uint8Array(createHash("sha256").update(input).digest());
  const leaf = new TextEncoder().encode("opaque-leaf");
  await assert.rejects(
    buildDeterministicRoot(TCAP_DOMAINS.epochIntentLeaf, [leaf, leaf], hash),
    /duplicate_accumulator_leaf/,
  );
});

test("default verifier cannot authorize a public exit", async () => {
  const verifier = new RejectingProofVerifier();
  assert.equal(await verifier.verify({
    proof: rejectingProof,
    publicInputs: {
      epochRoot: digest,
      previousTcapRoot: digest,
      nextTcapRoot: null,
      nullifier,
      assetCommitment: commitment,
      resultCommitments: [],
    },
  }), false);
});

test("TCAP principal and TSN fee liabilities are independently enforced", () => {
  assert.doesNotThrow(() => assertReserveState({
    version: 1,
    asset,
    assetEntry: address,
    vault: address,
    authority: address,
    actualReserveAssets: 100n,
    pendingLiabilities: 60n,
    settledLiabilities: 20n,
    withdrawalLiabilities: 10n,
    reservedRefundLiabilities: 10n,
    accountingEpoch: 1n,
    paused: false,
  }));
  assert.throws(() => assertTsnFeeReserveBacked(9n, {
    unpaidCrankerRewards: 5n,
    refundableSettlementFees: 5n,
    otherCommittedFees: 0n,
  }), /tsn_fee_reserve_underbacked/);
});

test("atomic funding rejects wrong reserve, decimals and reserve collision", () => {
  const entry = {
    version: 1,
    asset,
    reserveVault: "reserve",
    reserveAuthority: "authority",
    decimals: 6,
    depositsEnabled: true,
    withdrawalsEnabled: true,
    transferFeePolicy: "reject",
    authorityRisk: "none-declared",
    governanceApproval: digest,
    riskStatus: "active",
    deprecated: false,
  };
  const plan = {
    version: 1,
    asset,
    payerTokenAccount: "payer-token",
    tcapReserve: "wrong-reserve",
    tsnFeeReserve: "fee-reserve",
    protocolFeeDestination: null,
    principal: 10n,
    settlementFee: 1n,
    protocolFee: 0n,
    expectedDecimals: 6,
    exactNetReceived: true,
    pendingLiabilityCommitment: commitment,
    paymentIntentDigest: digest,
    fundedIntentLeaf: {
      version: 1,
      blindedFundedCommitment: commitment,
      fundingValidityCommitment: commitment,
      admissibleEpochCommitment: commitment,
    },
  };
  assert.throws(() => assertAtomicFundingPlan(plan, entry), /wrong_tcap_reserve/);
  assert.throws(() => assertAtomicFundingPlan({ ...plan, tcapReserve: "reserve", expectedDecimals: 9 }, entry), /wrong_funding_decimals/);
  assert.throws(() => assertAtomicFundingPlan({ ...plan, tcapReserve: "reserve", tsnFeeReserve: "reserve" }, entry), /principal_fee_reserve_collision/);
});

test("aggregated reward claim references epoch root, not payer intents", () => {
  const claim = {
    version: 1,
    epochId: 7n,
    cranker: address,
    aggregateAmount: 20n,
    rewardRoot: digest,
    rewardClaimNullifier: nullifier,
    allocationProof: new Uint8Array(),
  };
  assert.equal("paymentIntent" in claim, false);
  assert.equal("payer" in claim, false);
});
