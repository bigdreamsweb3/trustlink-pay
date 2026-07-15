import { canonicalFields } from "../receipts/internal/encoding.js";

export const TSN_DEVICE_AUTHORIZATION_VERSION = "tsn-device-authorization-v1";
export const TSN_DEVICE_AUTHORIZATION_DOMAIN = "TSN_OWNER_DEVICE_AUTHORIZATION";

export type HistoryRecoveryScope = "all" | "recent" | "selected" | "future-only";

export interface DeviceAuthorizationClaims {
  protocolVersion: typeof TSN_DEVICE_AUTHORIZATION_VERSION;
  domain: typeof TSN_DEVICE_AUTHORIZATION_DOMAIN;
  network: string;
  tinCommitment: string;
  ownerIdentityCommitment: string;
  deviceSigningKeyFingerprint: string;
  deviceEncryptionKeyFingerprint: string;
  permissions: string[];
  historyRecoveryScope: HistoryRecoveryScope;
  selectedReceiptIds?: string[];
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  audience: string;
}

function normalizedValues(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function canonicalizeDeviceAuthorizationClaims(
  claims: DeviceAuthorizationClaims,
): DeviceAuthorizationClaims {
  return {
    ...claims,
    permissions: normalizedValues(claims.permissions),
    ...(claims.historyRecoveryScope === "selected"
      ? { selectedReceiptIds: normalizedValues(claims.selectedReceiptIds ?? []) }
      : { selectedReceiptIds: undefined }),
  };
}

export function serializeDeviceAuthorization(claims: DeviceAuthorizationClaims): Uint8Array {
  const normalized = canonicalizeDeviceAuthorizationClaims(claims);
  return canonicalFields([
    normalized.domain,
    normalized.protocolVersion,
    normalized.network,
    normalized.tinCommitment,
    normalized.ownerIdentityCommitment,
    normalized.deviceSigningKeyFingerprint,
    normalized.deviceEncryptionKeyFingerprint,
    normalized.permissions.join(","),
    normalized.historyRecoveryScope,
    (normalized.selectedReceiptIds ?? []).join(","),
    normalized.nonce,
    normalized.issuedAt,
    normalized.expiresAt,
    normalized.audience,
  ]);
}
