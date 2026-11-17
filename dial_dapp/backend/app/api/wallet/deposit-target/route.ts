export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { getEscrowDepositAddress } from "@/app/blockchain/solana";
import { resolveSolanaRpcUrl } from "@/app/lib/rpc";

export async function GET() {
  try {
    const rpcUrl = resolveSolanaRpcUrl({ frontendSafe: false });

    return ok({
      address: getEscrowDepositAddress(),
      rpcUrl,
      chain: "solana",
      network: rpcUrl.includes("devnet") ? "devnet" : "custom",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
