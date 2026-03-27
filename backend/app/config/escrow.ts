import { PublicKey } from "@solana/web3.js";

import { env } from "@/app/lib/env";

export type EscrowFeeConfig = {
  treasuryOwner: string;
  feeBps: number;
  feeCapUiAmount: number;
};

function normalizePubkey(value: string, field: string) {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error(`${field} must be a valid Solana public key`);
  }
}

function normalizeBps(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 10_000) {
    throw new Error("TRUSTLINK_CLAIM_FEE_BPS must be between 0 and 10000");
  }
  return Math.floor(value);
}

function normalizeUiAmount(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT must be 0 or greater");
  }
  return value;
}

export function getEscrowFeeConfig(): EscrowFeeConfig {
  return {
    treasuryOwner: normalizePubkey(env.TRUSTLINK_TREASURY_OWNER!, "TRUSTLINK_TREASURY_OWNER"),
    feeBps: normalizeBps(env.TRUSTLINK_CLAIM_FEE_BPS),
    feeCapUiAmount: normalizeUiAmount(env.TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT),
  };
}
