import { PublicKey } from "@solana/web3.js";

import { env } from "@/app/lib/env";

export type RecoveryWalletConfig = {
  address: string;
  label: string;
  active: boolean;
};

export type EscrowPolicyConfig = {
  defaultExpirySeconds: number;
  autoclaimMaxUsd: number;
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
    defaultExpirySeconds: normalizeExpirySeconds(env.TRUSTLINK_DEFAULT_EXPIRY_SECONDS),
    autoclaimMaxUsd: normalizeUiAmount(env.TRUSTLINK_AUTOCLAIM_MAX_USD, "TRUSTLINK_AUTOCLAIM_MAX_USD"),
    recoveryWallets: parseRecoveryWallets(),
  };
}
