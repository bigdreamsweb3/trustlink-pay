export declare function estimateTsnSendCostFromChain(params: {
    senderWallet: string;
    amountUi: number;
    tokenDecimals?: number;
    tokenSymbol: string;
    tokenUsd?: number | null;
    solUsd?: number | null;
    rpcUrl?: string;
}): Promise<{
    tokenSymbol: string;
    senderFeeAmountUi: number;
    senderFeeAmountUsd: number;
    totalTokenRequiredUi: number;
    networkFeeSol: number;
    networkFeeUsd: number;
    debug: {
        programId: string;
        sendFeeBps: number;
        feeCoverageTxCount: number;
        estimatedNetworkFeeLamports: number;
        solUsd: number;
        tokenUsd: number;
        priceSource: string;
    };
}>;
//# sourceMappingURL=send-estimate.d.ts.map