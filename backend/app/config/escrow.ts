import { PublicKey } from "@solana/web3.js";

import { env } from "@/app/lib/env";

export type RecoveryWalletConfig = {
  address: string;
  label: string;
  active: boolean;
};

export type EscrowPolicyConfig = {
  treasuryOwner: string;
  sendFeeBps: number;
  sendFeeCapUiAmount: number;
  claimFeeBps: number;
  claimFeeCapUiAmount: number;
  defaultExpirySeconds: number;
  recoveryWallets: RecoveryWalletConfig[];
};

function normalizePubkey(value: string, field: string) {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error(`${field} must be a valid Solana public key`);
  }
}

function normalizeBps(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > 10_000) {
    throw new Error(`${field} must be between 0 and 10000`);
  }
  return Math.floor(value);
}

function normalizeUiAmount(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be 0 or greater`);
  }
  return value;
}

function normalizeExpirySeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("TRUSTLINK_DEFAULT_EXPIRY_SECONDS must be greater than 0");
  }
  return Math.floor(value);
}

function parseRecoveryWallets(): RecoveryWalletConfig[] {
  const rawValue = env.TRUSTLINK_RECOVERY_WALLETS;
  if (!rawValue) {
    return [];
  }

  const parsed = JSON.parse(rawValue) as Array<{
    address: string;
    label?: string;
    active?: boolean;
  }>;

  return parsed.map((entry, index) => ({
    address: normalizePubkey(entry.address, `TRUSTLINK_RECOVERY_WALLETS[${index}].address`),
    label: entry.label?.trim() || `recovery-${index + 1}`,
    active: entry.active ?? true,
  }));
}

export function getEscrowPolicyConfig(): EscrowPolicyConfig {
  return {
    treasuryOwner: normalizePubkey(env.TRUSTLINK_TREASURY_OWNER!, "TRUSTLINK_TREASURY_OWNER"),
    sendFeeBps: normalizeBps(env.TRUSTLINK_SEND_FEE_BPS, "TRUSTLINK_SEND_FEE_BPS"),
    sendFeeCapUiAmount: normalizeUiAmount(env.TRUSTLINK_SEND_FEE_MAX_UI_AMOUNT, "TRUSTLINK_SEND_FEE_MAX_UI_AMOUNT"),
    claimFeeBps: normalizeBps(env.TRUSTLINK_CLAIM_FEE_BPS, "TRUSTLINK_CLAIM_FEE_BPS"),
    claimFeeCapUiAmount: normalizeUiAmount(env.TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT, "TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT"),
    defaultExpirySeconds: normalizeExpirySeconds(env.TRUSTLINK_DEFAULT_EXPIRY_SECONDS),
    recoveryWallets: parseRecoveryWallets(),
  };
}
