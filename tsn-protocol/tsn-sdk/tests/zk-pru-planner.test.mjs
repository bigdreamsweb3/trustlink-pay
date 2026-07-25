import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutionPlan,
  calculateExecutionFees,
  calculateSpendTranches,
  selectOptimalSpendRoute,
  validateExecutionPlan,
} from "../dist/zk-pru-execution-planner.js";
import {
  createZkPruAssetState,
  determineRotationNeeded,
  isInSoftRotationRegion,
  recordReceipt,
  rotateActiveReceivingPru,
  consumeEmptyReservePru,
  getPruAllocationSummary,
} from "../dist/zk-pru-state-manager.js";

const defaultConfig = {
  baseReceiveTargetUsd: 1000,
  receiveTargetVariancePercent: 20,
  standardSpendTrancheUsd: 1000,
  largeReceiptThresholdUsd: 1000,
  minEmptyPrus: 2,
  targetEmptyPrus: 3,
  protocolFeeBps: 30,
  multiPruSurchargeBps: 10,
  accountCreationCostLamports: 2_039_280,
  transactionFixedCostLamports: 5_000,
  crankerRewardBps: 50,
  solUsd: 150,
  tokenUsd: 1,
  planTtlSeconds: 300,
};

const baseUnitsPerUsdc = 1_000_000n;

// ============================================================================
// Spend Selection Tests
// ============================================================================

test("A: Single PRU full fund selection", () => {
  const pruBalances = [
    {
      pruIndex: 0,
      availableBalance: 10000n * baseUnitsPerUsdc,
      assetMint: "EPjFWaLb3cwQB8q4Ui8k1y2JJoJfnEYh6qwxV2eoxyM",
    },
  ];

  const result = selectOptimalSpendRoute(
    pruBalances,
    0n,
    50n * baseUnitsPerUsdc,
    defaultConfig,
  );

  assert.equal(result.strategy, "single_pru_full_fund");
  assert.deepEqual(result.selectedPrus, [0]);
  assert.equal(result.walletTopup, 0n);
  assert.equal(result.feasible, true);
});

test("B: Multi-PRU selection when single PRU insufficient", () => {
  const pruBalances = [
    { pruIndex: 0, availableBalance: 40n * baseUnitsPerUsdc, assetMint: "USDC" },
    { pruIndex: 1, availableBalance: 50n * baseUnitsPerUsdc, assetMint: "USDC" },
    { pruIndex: 2, availableBalance: 30n * baseUnitsPerUsdc, assetMint: "USDC" },
  ];

  const result = selectOptimalSpendRoute(
    pruBalances,
    0n,
    100n * baseUnitsPerUsdc,
    defaultConfig,
  );

  assert.ok(result.selectedPrus.length > 0);
  assert.equal(result.feasible, true);
});

test("C: Wallet top-up when PRUs insufficient", () => {
  const pruBalances = [
    { pruIndex: 0, availableBalance: 40n * baseUnitsPerUsdc, assetMint: "USDC" },
    { pruIndex: 1, availableBalance: 30n * baseUnitsPerUsdc, assetMint: "USDC" },
  ];

  const result = selectOptimalSpendRoute(
    pruBalances,
    100n * baseUnitsPerUsdc,
    100n * baseUnitsPerUsdc,
    defaultConfig,
  );

  assert.equal(result.feasible, true);
});

test("D: Insufficient funds scenario", () => {
  const pruBalances = [
    { pruIndex: 0, availableBalance: 40n * baseUnitsPerUsdc, assetMint: "USDC" },
  ];

  const result = selectOptimalSpendRoute(
    pruBalances,
    20n * baseUnitsPerUsdc,
    100n * baseUnitsPerUsdc,
    defaultConfig,
  );

  assert.equal(result.feasible, false);
});

// ============================================================================
// Tranche Extraction Tests
// ============================================================================

test("E: Small payment tranche extraction", () => {
  const tranches = calculateSpendTranches({
    pruBalance: 10000n * baseUnitsPerUsdc,
    paymentAmount: 50n * baseUnitsPerUsdc,
    standardTrancheUsd: 1000,
    tokenUsd: 1,
    assetDecimals: 6,
  });

  assert.equal(tranches.length, 2);
  const paymentTranche = tranches.find((t) => t.destination === "payment");
  const changeTranche = tranches.find((t) => t.destination === "change");

  assert.ok(paymentTranche);
  assert.ok(changeTranche);
  assert.equal(paymentTranche.amount, 50n * baseUnitsPerUsdc);
  assert.equal(changeTranche.amount, 950n * baseUnitsPerUsdc);
});

test("F: Large payment no tranche extraction", () => {
  const tranches = calculateSpendTranches({
    pruBalance: 5000n * baseUnitsPerUsdc,
    paymentAmount: 2000n * baseUnitsPerUsdc,
    standardTrancheUsd: 1000,
    tokenUsd: 1,
    assetDecimals: 6,
  });

  const paymentTranche = tranches.find((t) => t.destination === "payment");
  assert.equal(paymentTranche.amount, 2000n * baseUnitsPerUsdc);
});

test("G: Exact payment (balance equals payment)", () => {
  const tranches = calculateSpendTranches({
    pruBalance: 50n * baseUnitsPerUsdc,
    paymentAmount: 50n * baseUnitsPerUsdc,
    standardTrancheUsd: 1000,
    tokenUsd: 1,
    assetDecimals: 6,
  });

  assert.equal(tranches.length, 1);
  assert.equal(tranches[0].amount, 50n * baseUnitsPerUsdc);
});

// ============================================================================
// Fee Calculation Tests
// ============================================================================

test("H: Fee calculation for single PRU payment", () => {
  const fees = calculateExecutionFees({
    paymentAmountBaseUnits: 50n * baseUnitsPerUsdc,
    selectedPruCount: 1,
    changeOutputCount: 1,
    walletTopupRequired: false,
    expectedTransactionCount: 1,
    config: defaultConfig,
  });

  assert.ok(fees.protocolFeeBaseUnits > 0n);
  assert.ok(fees.crankerRewardBaseUnits > 0n);
  assert.ok(fees.totalFeeBaseUnits > 0n);
});

test("I: Multi-PRU fee has higher cost than single-PRU", () => {
  const feesMulti = calculateExecutionFees({
    paymentAmountBaseUnits: 100n * baseUnitsPerUsdc,
    selectedPruCount: 2,
    changeOutputCount: 1,
    walletTopupRequired: false,
    expectedTransactionCount: 2,
    config: defaultConfig,
  });

  const feesSingle = calculateExecutionFees({
    paymentAmountBaseUnits: 100n * baseUnitsPerUsdc,
    selectedPruCount: 1,
    changeOutputCount: 0,
    walletTopupRequired: false,
    expectedTransactionCount: 1,
    config: defaultConfig,
  });

  assert.ok(feesMulti.protocolFeeBaseUnits > feesSingle.protocolFeeBaseUnits);
});

// ============================================================================
// Full Execution Plan Tests
// ============================================================================

test("J: Full execution plan - single PRU, small payment", () => {
  const input = {
    tinId: "tin:12345",
    assetMint: "EPjFWaLb3cwQB8q4Ui8k1y2JJoJfnEYh6qwxV2eoxyM",
    assetSymbol: "USDC",
    assetDecimals: 6,
    paymentAmountBaseUnits: 50n * baseUnitsPerUsdc,
    recipientIdentity: "recipient:99999",
    availablePruBalances: [
      {
        pruIndex: 0,
        availableBalance: 10000n * baseUnitsPerUsdc,
        assetMint: "EPjFWaLb3cwQB8q4Ui8k1y2JJoJfnEYh6qwxV2eoxyM",
      },
    ],
    emptyPruIndices: [1, 2],
    walletAvailableBaseUnits: 0n,
    currentSpendNonce: 0,
  };

  const plan = buildExecutionPlan(input, defaultConfig);

  assert.equal(plan.status, "PLANNED");
  assert.equal(plan.selectionStrategy, "single_pru_full_fund");
  assert.equal(plan.selectedPrus.length, 1);
  assert.equal(plan.selectedPrus[0].pruIndex, 0);
  assert.equal(plan.expectedSolanaTransactionCount, 1);
  assert.ok(plan.totalChangeAmount > 0n);
});

test("K: Full execution plan - multi-PRU payment", () => {
  const input = {
    tinId: "tin:12345",
    assetMint: "USDC",
    assetSymbol: "USDC",
    assetDecimals: 6,
    paymentAmountBaseUnits: 100n * baseUnitsPerUsdc,
    recipientIdentity: "recipient:99999",
    availablePruBalances: [
      {
        pruIndex: 0,
        availableBalance: 60n * baseUnitsPerUsdc,
        assetMint: "USDC",
      },
      {
        pruIndex: 1,
        availableBalance: 50n * baseUnitsPerUsdc,
        assetMint: "USDC",
      },
    ],
    emptyPruIndices: [3, 4],
    walletAvailableBaseUnits: 0n,
    currentSpendNonce: 0,
  };

  const plan = buildExecutionPlan(input, defaultConfig);

  assert.equal(plan.status, "PLANNED");
  assert.ok(plan.selectedPrus.length > 0, "Should select at least one PRU");
  assert.ok(plan.totalSpendFromPrus >= 100n * baseUnitsPerUsdc, "Should select enough to cover payment");
  assert.ok(plan.expectedSolanaTransactionCount >= 1);
});

test("L: Execution plan validation - expired plan", () => {
  const input = {
    tinId: "tin:12345",
    assetMint: "USDC",
    assetSymbol: "USDC",
    assetDecimals: 6,
    paymentAmountBaseUnits: 50n * baseUnitsPerUsdc,
    recipientIdentity: "recipient:99999",
    availablePruBalances: [
      {
        pruIndex: 0,
        availableBalance: 1000n * baseUnitsPerUsdc,
        assetMint: "USDC",
      },
    ],
    emptyPruIndices: [1],
    walletAvailableBaseUnits: 0n,
    currentSpendNonce: 0,
  };

  let plan = buildExecutionPlan(input, defaultConfig);
  plan.expiryTimestamp = Math.floor(Date.now() / 1000) - 100;

  const validation = validateExecutionPlan(plan);
  assert.equal(validation.valid, false);
});

// ============================================================================
// State Manager Tests
// ============================================================================

test("M: Create and initialize ZK-PRU state", () => {
  const state = createZkPruAssetState({
    tinId: "tin:12345",
    assetMint: "USDC",
    assetSymbol: "USDC",
    assetDecimals: 6,
    initialActiveReceivingPruIndex: 0,
    initialEmptyReservePruIndices: [1, 2],
    baseReceiveTargetUsd: 1000,
    receiveTargetVariancePercent: 20,
    minEmptyReserveCount: 2,
    targetEmptyReserveCount: 3,
  });

  assert.equal(state.activeReceivingPruIndex, 0);
  assert.equal(state.activeReceivingBalanceBaseUnits, 0n);
  assert.equal(state.emptyReservePruIndices.length, 2);
  assert.equal(state.version, 1);
});

test("N: Record receipts and soft rotation detection", () => {
  let state = createZkPruAssetState({
    tinId: "tin:12345",
    assetMint: "USDC",
    assetSymbol: "USDC",
    assetDecimals: 6,
    initialActiveReceivingPruIndex: 0,
    initialEmptyReservePruIndices: [1, 2],
    baseReceiveTargetUsd: 1000,
    receiveTargetVariancePercent: 20,
    minEmptyReserveCount: 2,
    targetEmptyReserveCount: 3,
  });

  state = recordReceipt(state, 10n * baseUnitsPerUsdc);
  state = recordReceipt(state, 20n * baseUnitsPerUsdc);
  state = recordReceipt(state, 30n * baseUnitsPerUsdc);
  state = recordReceipt(state, 40n * baseUnitsPerUsdc);

  assert.equal(state.activeReceivingBalanceBaseUnits, 100n * baseUnitsPerUsdc);
  assert.equal(state.receiptCountOnActivePru, 4);
  assert.equal(state.version, 5);

  const { inRegion, percentOfTarget } = isInSoftRotationRegion({
    currentBalanceBaseUnits: state.activeReceivingBalanceBaseUnits,
    rotationTargetBaseUnits: state.receivingRotationTargetBaseUnits,
    softRotationThresholdPercent: state.softRotationThresholdPercent,
  });

  assert.equal(inRegion, false);
  assert.ok(percentOfTarget < 70);
});

test("O: Rotation and state transitions", () => {
  let state = createZkPruAssetState({
    tinId: "tin:12345",
    assetMint: "USDC",
    assetSymbol: "USDC",
    assetDecimals: 6,
    initialActiveReceivingPruIndex: 0,
    initialEmptyReservePruIndices: [1, 2, 3],
    baseReceiveTargetUsd: 1000,
    receiveTargetVariancePercent: 20,
    minEmptyReserveCount: 2,
    targetEmptyReserveCount: 3,
  });

  state = recordReceipt(state, 800n * baseUnitsPerUsdc);
  state = rotateActiveReceivingPru(state, 4);

  assert.equal(state.activeReceivingPruIndex, 4);
  assert.equal(state.activeReceivingBalanceBaseUnits, 0n);
  assert.ok(state.sealedPruIndices.has(0));
  assert.equal(state.version, 3);
});

test("P: Empty reserve consumption and replenishment", () => {
  let state = createZkPruAssetState({
    tinId: "tin:12345",
    assetMint: "USDC",
    assetSymbol: "USDC",
    assetDecimals: 6,
    initialActiveReceivingPruIndex: 0,
    initialEmptyReservePruIndices: [1, 2, 3],
    baseReceiveTargetUsd: 1000,
    receiveTargetVariancePercent: 20,
    minEmptyReserveCount: 2,
    targetEmptyReserveCount: 3,
  });

  const initialCount = state.emptyReservePruIndices.length;
  state = consumeEmptyReservePru(state);

  assert.equal(state.emptyReservePruIndices.length, initialCount - 1);

  state = consumeEmptyReservePru(state);
  state = consumeEmptyReservePru(state);

  const summary = getPruAllocationSummary(state);
  assert.equal(summary.needsReserveReplenishment, true);
});

test("Q: Realistic scenario - 4 small receipts then 5 USDC payment", () => {
  let state = createZkPruAssetState({
    tinId: "tin:12345",
    assetMint: "USDC",
    assetSymbol: "USDC",
    assetDecimals: 6,
    initialActiveReceivingPruIndex: 0,
    initialEmptyReservePruIndices: [1, 2, 3],
    baseReceiveTargetUsd: 1000,
    receiveTargetVariancePercent: 20,
    minEmptyReserveCount: 2,
    targetEmptyReserveCount: 3,
  });

  state = recordReceipt(state, 1n * baseUnitsPerUsdc);
  state = recordReceipt(state, 5n * baseUnitsPerUsdc);
  state = recordReceipt(state, 3n * baseUnitsPerUsdc);
  state = recordReceipt(state, 10n * baseUnitsPerUsdc);

  assert.equal(state.activeReceivingBalanceBaseUnits, 19n * baseUnitsPerUsdc);
  assert.equal(state.receiptCountOnActivePru, 4);

  const pruBalances = [
    {
      pruIndex: 0,
      availableBalance: state.activeReceivingBalanceBaseUnits,
      assetMint: "USDC",
    },
  ];

  const input = {
    tinId: state.tinId,
    assetMint: state.assetMint,
    assetSymbol: state.assetSymbol,
    assetDecimals: state.assetDecimals,
    paymentAmountBaseUnits: 5n * baseUnitsPerUsdc,
    recipientIdentity: "recipient:99999",
    availablePruBalances: pruBalances,
    emptyPruIndices: state.emptyReservePruIndices,
    walletAvailableBaseUnits: 0n,
    currentSpendNonce: state.spendNonce,
  };

  const plan = buildExecutionPlan(input, defaultConfig);

  assert.equal(plan.selectionStrategy, "single_pru_full_fund");
  assert.equal(plan.expectedSolanaTransactionCount, 1);
  assert.ok(plan.totalChangeAmount > 0n);
  assert.equal(plan.selectedPrus.length, 1);
});
