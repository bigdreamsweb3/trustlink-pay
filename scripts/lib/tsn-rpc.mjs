import { Connection } from "@solana/web3.js";

export const DEFAULT_TSN_RPC_GATEWAY_URL = "https://tsn-rpc-gateway.wasmer.app";

export function resolveSolanaRpcUrls(options = {}) {
  return [resolveSolanaRpcUrl(options)];
}

export function resolveSolanaRpcUrl(_options = {}) {
  return String(
    process.env.TSN_RPC_GATEWAY_URL || DEFAULT_TSN_RPC_GATEWAY_URL,
  ).replace(/\/+$/, "");
}

export function createSolanaConnection({ commitment = "confirmed" } = {}) {
  return new Connection(resolveSolanaRpcUrl(), commitment);
}

export async function withRpcFallback(operation, options = {}) {
  const rpcUrl = resolveSolanaRpcUrl(options);
  return operation(
    new Connection(rpcUrl, options.commitment ?? "confirmed"),
    rpcUrl,
  );
}

export function describeRpcSelection(options = {}) {
  const urls = resolveSolanaRpcUrls(options);
  return {
    urls,
    selected: urls[0],
  };
}
