import { Connection, type Commitment } from "@solana/web3.js";

export const DEFAULT_TSN_RPC_GATEWAY_URL = "https://tsn-rpc-gateway.vercel.app";
export const LOCAL_TSN_RPC_GATEWAY_URL = "http://127.0.0.1:8787";

type RpcSelectionOptions = {
  frontendSafe?: boolean;
};

export function resolveSolanaRpcUrls(_options: RpcSelectionOptions = {}) {
  const configured = process.env.TSN_RPC_GATEWAY_URL?.trim();
  if (configured) {
    const selected = configured.replace(/\/+$/, "");
    return selected === LOCAL_TSN_RPC_GATEWAY_URL
      ? [selected, DEFAULT_TSN_RPC_GATEWAY_URL]
      : [selected];
  }
  return process.env.VERCEL
    ? [DEFAULT_TSN_RPC_GATEWAY_URL]
    : [LOCAL_TSN_RPC_GATEWAY_URL, DEFAULT_TSN_RPC_GATEWAY_URL];
}

export function resolveSolanaRpcUrl(_options: RpcSelectionOptions = {}) {
  return resolveSolanaRpcUrls(_options)[0];
}

export function createSolanaConnection({
  commitment = "confirmed",
}: {
  commitment?: Commitment;
  frontendSafe?: boolean;
} = {}) {
  return new Connection(resolveSolanaRpcUrl(), commitment);
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
  throw lastError instanceof Error
    ? lastError
    : new Error("All Solana RPC endpoints failed");
}

export function describeRpcSelection(options = {}) {
  const urls = resolveSolanaRpcUrls(options);
  return { urls, selected: urls[0] };
}
