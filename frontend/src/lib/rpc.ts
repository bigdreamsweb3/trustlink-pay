import { Connection, type Commitment } from "@solana/web3.js";

export const DEFAULT_TSN_RPC_GATEWAY_URL = "http://127.0.0.1:8787";

type RpcSelectionOptions = {
  frontendSafe?: boolean;
};

export function resolveSolanaRpcUrls(_options: RpcSelectionOptions = {}) {
  return [resolveSolanaRpcUrl()];
}

export function resolveSolanaRpcUrl(_options: RpcSelectionOptions = {}) {
  return (
    process.env.NEXT_PUBLIC_TSN_RPC_GATEWAY_URL ?? DEFAULT_TSN_RPC_GATEWAY_URL
  ).replace(/\/+$/, "");
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
  const rpcUrl = resolveSolanaRpcUrl(options);
  return operation(
    new Connection(rpcUrl, options.commitment ?? "confirmed"),
    rpcUrl,
  );
}

export function describeRpcSelection(options = {}) {
  const urls = resolveSolanaRpcUrls(options);
  return { urls, selected: urls[0] };
}
