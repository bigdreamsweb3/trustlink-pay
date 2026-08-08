import { Connection, type Commitment } from "@solana/web3.js";

export const DEFAULT_TSN_RPC_GATEWAY_URL = "https://tsn-rpc-gateway.wasmer.app";

function normalizeRpcGatewayUrl(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return DEFAULT_TSN_RPC_GATEWAY_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return DEFAULT_TSN_RPC_GATEWAY_URL;
    }
    if (parsed.pathname !== "/" && parsed.pathname !== "/rpc") {
      return DEFAULT_TSN_RPC_GATEWAY_URL;
    }
    parsed.pathname = parsed.pathname === "/rpc" ? "/rpc" : "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_TSN_RPC_GATEWAY_URL;
  }
}

type RpcSelectionOptions = {
  frontendSafe?: boolean;
};

export function resolveSolanaRpcUrls(_options: RpcSelectionOptions = {}) {
  return [resolveSolanaRpcUrl()];
}

export function resolveSolanaRpcUrl(_options: RpcSelectionOptions = {}) {
  return normalizeRpcGatewayUrl(process.env.NEXT_PUBLIC_TSN_RPC_GATEWAY_URL);
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
