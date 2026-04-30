export const runtime = "nodejs";

import { z } from "zod";

import { ok, toErrorResponse } from "@/app/lib/http";
import { prepareCreateEscrowV3 } from "@/app/blockchain/trustlink-pay-v3";

const schema = z.object({
  senderWallet: z.string().trim().min(32).max(64),
  tokenMintAddress: z.string().trim().min(32).max(64),
  amount: z.number().positive(),
  recipientChildHashHex: z.string().trim().length(64),
  masterRegistryPubkey: z.string().trim().min(32).max(64),
  nonce: z.coerce.bigint(),
  expiryUnixSeconds: z.coerce.bigint(),
  autoClaimDestinationHashHex: z.string().trim().length(64),
  derivationProofSigHex: z.string().trim().length(128),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = schema.parse(body);
    return ok(await prepareCreateEscrowV3(payload));
  } catch (error) {
    return toErrorResponse(error);
  }
}
