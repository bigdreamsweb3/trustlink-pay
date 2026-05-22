function lamportsToSol(lamports) {
    return lamports / 1_000_000_000;
}
function roundUpToDecimals(value, decimals) {
    const multiplier = 10 ** decimals;
    return Math.ceil(value * multiplier) / multiplier;
}
export function quoteTransferFeeUiAmount(input) {
    if (input.estimatedNetworkFeeLamports <= 0 ||
        !input.solUsd ||
        !input.tokenUsd ||
        input.tokenUsd <= 0 ||
        input.coverageTxCount <= 0) {
        return 0;
    }
    const networkFeeSol = lamportsToSol(input.estimatedNetworkFeeLamports);
    const networkFeeUsd = networkFeeSol * input.solUsd;
    const coveredNetworkFeeUsd = networkFeeUsd * input.coverageTxCount;
    const uncappedMarginUsd = (coveredNetworkFeeUsd * input.feeBps) / 10_000;
    const marginUsd = input.maxMarginUsd > 0 ? Math.min(uncappedMarginUsd, input.maxMarginUsd) : uncappedMarginUsd;
    const tokenFee = (coveredNetworkFeeUsd + marginUsd) / input.tokenUsd;
    const rounded = roundUpToDecimals(tokenFee, input.tokenDecimals);
    return input.maxUiAmount > 0 ? Math.min(rounded, input.maxUiAmount) : rounded;
}
