import { Connection, type Commitment } from "@solana/web3.js";

export const DEFAULT_SOLANA_RPC_URL = "https://api.devnet.solana.com";

type RpcSelectionOptions = {
  fallbackToDevnet?: boolean;
  frontendSafe?: boolean;
};

function splitRpcUrlList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\s]+/g)
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function resolveSolanaRpcUrls({
  fallbackToDevnet = true,
}: RpcSelectionOptions = {}) {
  const urls = [
    ...new Set(splitRpcUrlList(process.env.NEXT_PUBLIC_TSN_SOLANA_RPC_URLS)),
  ];
  if (urls.length > 0) return urls;
  return fallbackToDevnet ? [DEFAULT_SOLANA_RPC_URL] : [];
}

export function resolveSolanaRpcUrl(options: RpcSelectionOptions = {}) {
  return resolveSolanaRpcUrls(options)[0] ?? DEFAULT_SOLANA_RPC_URL;
}

export function createSolanaConnection({
  commitment = "confirmed",
  fallbackToDevnet = true,
}: {
  commitment?: Commitment;
  fallbackToDevnet?: boolean;
  frontendSafe?: boolean;
} = {}) {
  return new Connection(resolveSolanaRpcUrl({ fallbackToDevnet }), commitment);
}

export async function withRpcFallback<T>(
  operation: (connection: Connection, rpcUrl: string) => Promise<T>,
  options: RpcSelectionOptions & { commitment?: Commitment } = {},
) {
  let lastError: unknown;
  for (const rpcUrl of resolveSolanaRpcUrls(options)) {
    try {
      return await operation(
        new Connection(rpcUrl, options.commitment ?? "confirmed"),
        rpcUrl,
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("No Solana RPC endpoint is configured");
}

export function describeRpcSelection(options = {}) {
  const urls = resolveSolanaRpcUrls(options);
  return { urls, selected: urls[0] ?? DEFAULT_SOLANA_RPC_URL };
}
