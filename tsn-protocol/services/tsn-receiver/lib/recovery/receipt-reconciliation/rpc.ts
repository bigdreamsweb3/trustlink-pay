import type { Dependencies } from "./dependencies";

/** rpc component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function rpc(dependencies: Pick<Dependencies, "environment" | "fetch">, method: string, params: unknown[], allowNull = false) {
  const url = dependencies.environment.TSN_RPC_URL?.trim() || dependencies.environment.TSN_RPC_GATEWAY_URL?.trim() || "https://tsn-rpc-gateway.vercel.app";
  const response = await dependencies.fetch(url, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("SETTLEMENT_RECONCILIATION_RPC_UNAVAILABLE");
  const data = await response.json();
  if (data.error || !("result" in data) || (!allowNull && !data.result)) throw new Error("SETTLEMENT_RECONCILIATION_RPC_RECEIPT_UNAVAILABLE");
  return data.result;
}
