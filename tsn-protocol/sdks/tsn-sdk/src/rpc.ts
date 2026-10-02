import { Connection, type Commitment } from "@solana/web3.js";

export const DEFAULT_TSN_RPC_GATEWAY_URL = "https://tsn-rpc-gateway.vercel.app";

type RpcSelectionOptions = {
  frontendSafe?: boolean;
};

export function resolveSolanaRpcUrls(_options: RpcSelectionOptions = {}) {
  const configured = process.env.TSN_RPC_URL?.trim() || process.env.TSN_RPC_GATEWAY_URL?.trim();
  return [configured ? configured.replace(/\/+$/, "") : DEFAULT_TSN_RPC_GATEWAY_URL];
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
