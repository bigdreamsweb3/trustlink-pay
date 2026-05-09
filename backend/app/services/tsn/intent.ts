import { upsertPaymentIntent } from "@/app/db/tsn";
import type { PaymentRecord } from "@/app/types/payment";
import { sha256 } from "@/app/utils/hash";
import { logger } from "@/app/lib/logger";
import { env } from "@/app/lib/env";
import { PublicKey } from "@solana/web3.js";

import { sha256Bytes, tsnCreateIntentOnChain } from "@/app/blockchain/solana";
import { getAllowedTokenByMint, toBaseUnits } from "@/app/blockchain/solana-core";

export async function createTsnIntentForPayment(payment: PaymentRecord) {
  if (!env.TSN_ENABLED) {
    return { enabled: false as const };
  }

  const tokenMint = payment.token_mint_address;
  if (!tokenMint) {
    throw new Error("Missing token mint for payment");
  }

  const allowed = getAllowedTokenByMint(tokenMint);
  if (!allowed) {
    throw new Error("Token mint not allowlisted for TSN intent");
  }

  const intentSeedHash = sha256(payment.id); // hex string (64 chars)
  const recipientHash = payment.receiver_phone_hash;

  const record = await upsertPaymentIntent({
    id: payment.id,
    paymentId: payment.id,
    intentSeedHash,
    recipientHash,
    tokenMintAddress: tokenMint,
    amount: Number(payment.amount),
  });

  if (!env.TSN_CREATE_INTENTS_ONCHAIN) {
    logger.info("tsn.intent.db_created", { paymentId: payment.id, intentId: record.id });
    return { enabled: true as const, record, onchain: null as null };
  }

  try {
    const intentSeed32 = sha256Bytes(payment.id); // Buffer 32
    const recipientHash32 = Buffer.from(recipientHash, "hex");
    if (!payment.escrow_account) {
      throw new Error("Missing escrow account for payment");
    }
    const onchain = await tsnCreateIntentOnChain({
      intentSeed32,
      underlyingPayment: new PublicKey(payment.escrow_account),
      tokenMint: new PublicKey(tokenMint),
      amountBaseUnits: toBaseUnits(Number(payment.amount), allowed.decimals),
      recipientHash32,
    });
    return { enabled: true as const, record, onchain };
  } catch (error) {
    logger.warn("tsn.intent.onchain_create_failed", {
      paymentId: payment.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { enabled: true as const, record, onchain: null as null };
  }
}
