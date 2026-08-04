import type { Transaction, TransactionSignature } from "@solana/web3.js";

type ReownSolanaProvider = {
  disconnect?: () => Promise<void>;
  signMessage?: (
    message: Uint8Array,
    display?: "utf8" | "hex",
  ) => Promise<Uint8Array | { signature: Uint8Array | number[] }>;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (
    transaction: Transaction,
    options?: {
      skipPreflight?: boolean;
      preflightCommitment?: "processed" | "confirmed" | "finalized";
    },
  ) => Promise<{ signature: TransactionSignature }>;
};

export function bindReownSolanaProvider(provider: unknown) {
  const reownProvider = provider as ReownSolanaProvider;

  return {
    disconnect:
      typeof reownProvider.disconnect === "function"
        ? () => reownProvider.disconnect!.call(reownProvider)
        : undefined,
    signMessage:
      typeof reownProvider.signMessage === "function"
        ? (message: Uint8Array) =>
            // Reown's Solana adapter exposes detached message signing.  Do
            // not pass a display/transaction argument through this boundary;
            // some Wallet Standard providers interpret a second argument as
            // a transaction request and reject the call.
            reownProvider.signMessage!.call(reownProvider, message)
        : undefined,
    signTransaction:
      typeof reownProvider.signTransaction === "function"
        ? (transaction: Transaction) =>
            reownProvider.signTransaction!.call(reownProvider, transaction)
        : undefined,
    signAndSendTransaction:
      typeof reownProvider.signAndSendTransaction === "function"
        ? (
            transaction: Transaction,
            options?: {
              skipPreflight?: boolean;
              preflightCommitment?: "processed" | "confirmed" | "finalized";
            },
          ) =>
            reownProvider.signAndSendTransaction!.call(
              reownProvider,
              transaction,
              options,
            )
        : undefined,
  };
}
