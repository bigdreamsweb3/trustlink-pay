export const runtime = "nodejs";

import { ok, toErrorResponse } from "@/app/lib/http";
import { env } from "@/app/lib/env";
import { getEscrowDepositAddress } from "@/app/blockchain/solana";

export async function GET() {
  try {
    return ok({
      address: getEscrowDepositAddress(),
      rpcUrl: env.SOLANA_RPC_URL,
      chain: "solana",
      network: env.SOLANA_RPC_URL.includes("devnet") ? "devnet" : "custom",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
