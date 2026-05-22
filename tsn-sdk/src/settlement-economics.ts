export type SettlementLikelihood = "likely_claimable" | "risky_claim_amount" | "economically_non_claimable";

export type SettlementEconomicsInput = {
  paymentAmountUi: number;
  tokenUsd: number | null;
  estimatedExecutionCostLamports: number;
  solUsd: number | null;
  operatorFeeUi: number;
  ataCreationCostLamports?: number;
  safetyMultiplier?: number;
};

export type SettlementEconomicsResult = {
  likelihood: SettlementLikelihood;
  netSettleableValueUi: number;
  estimatedOperationalCostUi: number;
  minimumTransferUi: number;
  reason: string;
};

const LAMPORTS_PER_SOL = 1_000_000_000;

function lamportsToSol(lamports: number) {
  return lamports / LAMPORTS_PER_SOL;
}

export function evaluateSettlementEconomics(input: SettlementEconomicsInput): SettlementEconomicsResult {
  const safetyMultiplier = input.safetyMultiplier ?? 1.25;
  const ataCreation = input.ataCreationCostLamports ?? 0;
  const totalLamports = Math.max(0, input.estimatedExecutionCostLamports + ataCreation);

  if (!input.solUsd || !input.tokenUsd || input.tokenUsd <= 0) {
    const coarseCostUi = input.operatorFeeUi;
    const net = input.paymentAmountUi - coarseCostUi;
    const likelihood: SettlementLikelihood = net <= 0 ? "economically_non_claimable" : net < input.paymentAmountUi * 0.15 ? "risky_claim_amount" : "likely_claimable";
    return {
      likelihood,
      netSettleableValueUi: Math.max(0, net),
      estimatedOperationalCostUi: coarseCostUi,
      minimumTransferUi: coarseCostUi * safetyMultiplier,
      reason: "Price feed unavailable; using conservative operator-only estimate.",
    };
  }

  const operationalCostUsd = lamportsToSol(totalLamports) * input.solUsd;
  const operationalCostUi = operationalCostUsd / input.tokenUsd;
  const estimatedOperationalCostUi = operationalCostUi + input.operatorFeeUi;
  const netSettleableValueUi = input.paymentAmountUi - estimatedOperationalCostUi;
  const minimumTransferUi = estimatedOperationalCostUi * safetyMultiplier;

  if (netSettleableValueUi <= 0) {
    return {
      likelihood: "economically_non_claimable",
      netSettleableValueUi: 0,
      estimatedOperationalCostUi,
      minimumTransferUi,
      reason: "Estimated settlement cost equals or exceeds transfer value.",
    };
  }

  if (input.paymentAmountUi < minimumTransferUi) {
    return {
      likelihood: "risky_claim_amount",
      netSettleableValueUi,
      estimatedOperationalCostUi,
      minimumTransferUi,
      reason: "Transfer is above break-even but below safety threshold for reliable settlement.",
    };
  }

  return {
    likelihood: "likely_claimable",
    netSettleableValueUi,
    estimatedOperationalCostUi,
    minimumTransferUi,
    reason: "Transfer appears economically settleable under current network conditions.",
  };
}