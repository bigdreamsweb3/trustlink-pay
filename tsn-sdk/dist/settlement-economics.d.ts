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
export declare function evaluateSettlementEconomics(input: SettlementEconomicsInput): SettlementEconomicsResult;
//# sourceMappingURL=settlement-economics.d.ts.map