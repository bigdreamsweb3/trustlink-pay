import type { Dependencies } from "./dependencies";
import { fail } from "./fail";

/** rpc component. Inputs and results retain the original failed-settlement-resolution contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function rpc(dependencies: Pick<Dependencies, "environment" | "fetch">, method: string, params: unknown[]) {
  const url = dependencies.environment.TSN_RPC_URL?.trim() || dependencies.environment.TSN_RPC_GATEWAY_URL?.trim() || "https://tsn-rpc-gateway.vercel.app";
  try {
    const response = await dependencies.fetch(url, { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) fail("RPC_UNAVAILABLE");
    const body = await response.json();
    if (body.error || !("result" in body)) fail("RPC_UNAVAILABLE");
    return body.result;
  } catch { return fail("RPC_UNAVAILABLE"); }
}
