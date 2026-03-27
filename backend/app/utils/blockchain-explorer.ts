type SupportedChain = "solana" | "ethereum" | "bsc" | "base";

function isPlausibleSolanaSignature(signature: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature);
}

export function getTransactionExplorerUrl(params: {
  chain: SupportedChain;
  signature: string | null;
}): string | null {
  if (!params.signature) {
    return null;
  }

  switch (params.chain) {
    case "solana":
      if (!isPlausibleSolanaSignature(params.signature)) {
        return null;
      }

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
