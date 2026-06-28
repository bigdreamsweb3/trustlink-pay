export const DEFAULT_TSN_RPC_GATEWAY_URL = "http://127.0.0.1:8787";

type RpcSelectionOptions = {
  frontendSafe?: boolean;
};

export function resolveSolanaRpcUrls(_options: RpcSelectionOptions = {}) {
  return [resolveSolanaRpcUrl()];
}

export function resolveSolanaRpcUrl(_options: RpcSelectionOptions = {}) {
  return (process.env.TSN_RPC_GATEWAY_URL ?? DEFAULT_TSN_RPC_GATEWAY_URL).replace(
    /\/+$/,
    "",
  );
}
