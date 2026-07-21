import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCanonicalAssetId,
  assertTcapReserveBacked,
  assertTsnFeeReserveBacked,
  totalFunding,
} from "../dist/index.js";

test("funding separates principal, settlement fee and protocol fee", () => {
  assert.equal(totalFunding({ principal: 100n, settlementFee: 2n, protocolFee: 1n }), 103n);
});

test("TCAP reserve rejects liabilities above principal assets", () => {
  assert.throws(
    () => assertTcapReserveBacked(99n, {
      settledClaims: 70n,
      pendingClaims: 30n,
      withdrawalLiabilities: 0n,
      reservedRefundLiabilities: 0n,
    }),
    /tcap_reserve_underbacked/,
  );
});

test("TSN fees are validated independently from TCAP principal", () => {
  assert.doesNotThrow(() =>
    assertTsnFeeReserveBacked(20n, {
      unpaidCrankerRewards: 12n,
      refundableSettlementFees: 5n,
      otherCommittedFees: 3n,
    }),
  );
});

test("asset identity requires token program, exact mint, commitment and registry version", () => {
  assert.throws(
    () => assertCanonicalAssetId({ tokenProgram: "spl-token", mint: "", registryVersion: 1, assetCommitment: "abc" }),
    /invalid_tcap_asset_id/,
  );
});
