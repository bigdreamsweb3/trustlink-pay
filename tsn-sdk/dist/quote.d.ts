export type TsnTransferFeeQuoteInput = {
    estimatedNetworkFeeLamports: number;
    solUsd: number | null;
    tokenUsd: number | null;
    tokenDecimals: number;
    coverageTxCount: number;
    feeBps: number;
    maxMarginUsd: number;
    maxUiAmount: number;
};
export declare function quoteTransferFeeUiAmount(input: TsnTransferFeeQuoteInput): number;
//# sourceMappingURL=quote.d.ts.map