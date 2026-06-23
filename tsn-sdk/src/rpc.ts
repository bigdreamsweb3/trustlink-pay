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
  const urls = [...new Set(splitRpcUrlList(process.env.TSN_SOLANA_RPC_URLS))];
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
