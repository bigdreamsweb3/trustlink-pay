import { Connection, type Commitment } from "@solana/web3.js";

export const DEFAULT_TSN_RPC_GATEWAY_URL = "https://tsn-rpc-gateway.vercel.app";
const LOCAL_TSN_RPC_GATEWAY_URL = "http://127.0.0.1:8787";

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
  const configured = process.env.NEXT_PUBLIC_TSN_RPC_GATEWAY_URL?.trim();
  if (configured) {
    const selected = normalizeRpcGatewayUrl(configured);
    return selected === DEFAULT_TSN_RPC_GATEWAY_URL &&
      configured !== DEFAULT_TSN_RPC_GATEWAY_URL
      ? [DEFAULT_TSN_RPC_GATEWAY_URL]
      : [
          selected,
          ...(selected === LOCAL_TSN_RPC_GATEWAY_URL
            ? [DEFAULT_TSN_RPC_GATEWAY_URL]
            : []),
        ];
  }
  return [LOCAL_TSN_RPC_GATEWAY_URL, DEFAULT_TSN_RPC_GATEWAY_URL];
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
  const urls = resolveSolanaRpcUrls();
  return new Connection(urls[0], {
    commitment,
    fetch: async (input, init) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const candidates = urls.map((url) =>
        requestUrl.replace(/^https?:\/\/[^/]+/, url),
      );
      let lastError: unknown;
      for (const candidate of [...new Set(candidates)]) {
        try {
          const response = await fetch(candidate, init);
          if (response.status < 500) return response;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("All Solana RPC endpoints failed");
    },
  });
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
