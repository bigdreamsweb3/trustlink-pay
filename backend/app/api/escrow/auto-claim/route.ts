export const runtime = "nodejs";

import { z } from "zod";

import { ok, toErrorResponse } from "@/app/lib/http";
import { prepareAutoClaimEscrowV3 } from "@/app/blockchain/trustlink-pay-v3";

const schema = z.object({
  escrowPubkey: z.string().trim().min(32).max(64),
  escrowVault: z.string().trim().min(32).max(64),
  tokenMintAddress: z.string().trim().min(32).max(64),
  masterRegistryPubkey: z.string().trim().min(32).max(64),
  recipientChildHashHex: z.string().trim().length(64),
  nonce: z.coerce.bigint(),
  expiryUnixSeconds: z.coerce.bigint(),
  childPubkey: z.string().trim().min(32).max(64),
  destinationPubkey: z.string().trim().min(32).max(64),
  derivationProofSigHex: z.string().trim().length(128),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = schema.parse(body);
    return ok(await prepareAutoClaimEscrowV3(payload));
  } catch (error) {
    return toErrorResponse(error);
  }
}
