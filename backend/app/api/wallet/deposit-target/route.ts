export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { env } from "@/app/lib/env";
import { getEscrowDepositAddress } from "@/app/blockchain/solana";

export async function GET() {
  try {
    const rpcUrl = env.SOLANA_RPC_URL;
    if (!rpcUrl) {
      throw new Error("SOLANA_RPC_URL environment variable is not set");
    }
    
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
