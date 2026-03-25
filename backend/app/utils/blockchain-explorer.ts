type SupportedChain = "solana" | "ethereum" | "bsc" | "base";

export function getTransactionExplorerUrl(params: {
  chain: SupportedChain;
  signature: string | null;
}): string | null {
  if (!params.signature) {
    return null;
  }

  switch (params.chain) {
    case "solana":
      return `https://solscan.io/tx/${params.signature}?cluster=devnet`;
    case "ethereum":
      return `https://etherscan.io/tx/${params.signature}`;
    case "bsc":
      return `https://bscscan.com/tx/${params.signature}`;
    case "base":
      return `https://basescan.org/tx/${params.signature}`;
    default:
      return null;
  }
}
