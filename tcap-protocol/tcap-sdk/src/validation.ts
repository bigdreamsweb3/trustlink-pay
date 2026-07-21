import { assertCanonicalAssetId, assertTcapReserveBacked, assertTsnFeeReserveBacked } from "./contracts.js";
import type {
  AtomicFundingPlanV1,
  ConfidentialSettlementRequestV1,
  PaymentIntentV2,
  PublicSettlementRequestV1,
  TcapAssetEntryV1,
  TcapReserveStateV1,
  TsnFeeReserveStateV1,
} from "./models.js";

const FORBIDDEN_SETTLEMENT_KEYS = new Set([
  "payer",
  "payerWallet",
  "payerTokenAccount",
  "paymentIntent",
  "paymentIntentPda",
  "pendingLiability",
  "pendingLiabilityPda",
  "legacyEscrow",
  "senderContainer",
  "fundingTransaction",
  "fundedIntentLeaf",
]);

export function assertSettlementBoundary(request: PublicSettlementRequestV1 | ConfidentialSettlementRequestV1): void {
  for (const key of Object.keys(request)) {
    if (FORBIDDEN_SETTLEMENT_KEYS.has(key)) throw new Error(`forbidden_settlement_field:${key}`);
  }
}

export function assertPaymentIntentV2DataOnly(intent: PaymentIntentV2): void {
  const forbidden = ["tokenBalance", "vault", "recipient", "assignedCranker", "payoutSignature", "reimbursed"];
  for (const key of forbidden) {
    if (key in intent) throw new Error(`forbidden_payment_intent_v2_field:${key}`);
  }
}

export function assertAssetEntry(entry: TcapAssetEntryV1): void {
  assertCanonicalAssetId(entry.asset);
  if (!entry.reserveVault || !entry.reserveAuthority) throw new Error("invalid_tcap_reserve_derivation");
  if (!Number.isSafeInteger(entry.decimals) || entry.decimals < 0 || entry.decimals > 255) {
    throw new Error("invalid_asset_decimals");
  }
}

export function assertReserveState(state: TcapReserveStateV1): void {
  assertCanonicalAssetId(state.asset);
  assertTcapReserveBacked(state.actualReserveAssets, {
    settledClaims: state.settledLiabilities,
    pendingClaims: state.pendingLiabilities,
    withdrawalLiabilities: state.withdrawalLiabilities,
    reservedRefundLiabilities: state.reservedRefundLiabilities,
  });
}

export function assertFeeReserveState(state: TsnFeeReserveStateV1): void {
  assertCanonicalAssetId(state.asset);
  assertTsnFeeReserveBacked(state.fundedFeeAssets, {
    unpaidCrankerRewards: state.unpaidCrankerRewards,
    refundableSettlementFees: state.refundableFeeLiabilities,
    otherCommittedFees: state.protocolFeeAllocations + state.carryForwardFeeLiabilities,
  });
  if (state.claimedRewards < 0n) throw new RangeError("claimedRewards must not be negative");
}

export function assertAtomicFundingPlan(plan: AtomicFundingPlanV1, expected: TcapAssetEntryV1): void {
  assertAssetEntry(expected);
  assertCanonicalAssetId(plan.asset);
  if (plan.asset.mint !== expected.asset.mint || plan.asset.tokenProgram !== expected.asset.tokenProgram) {
    throw new Error("wrong_funding_asset");
  }
  if (plan.expectedDecimals !== expected.decimals) throw new Error("wrong_funding_decimals");
  if (plan.tcapReserve !== expected.reserveVault) throw new Error("wrong_tcap_reserve");
  if (plan.principal <= 0n || plan.settlementFee < 0n || plan.protocolFee < 0n) throw new Error("partial_funding");
  if (expected.transferFeePolicy === "exact-net-received" && !plan.exactNetReceived) {
    throw new Error("net_received_verification_required");
  }
  if (plan.tcapReserve === plan.tsnFeeReserve) throw new Error("principal_fee_reserve_collision");
}
