import type { HistoryRecoveryScope } from "../authorization/index.js";

export type PrivateHistoryState =
  | { status: "none" }
  | { status: "available" }
  | { status: "recovery-required"; message: "Historical private records found. Authorize secure recovery to restore access on this device." }
  | { status: "recovery-unavailable"; message: "Historical private records cannot be restored because no authorized device or recovery credential is available." };

export type RecoveryMethod = "authorized-device" | "recovery-credential";

export interface PrivateHistoryInventory {
  historicalReceiptCount: number;
  accessibleHistoricalReceiptCount: number;
  activeApprovingDeviceCount: number;
  activeRecoveryCredentialCount: number;
}

export interface RecoveryOption {
  method: RecoveryMethod;
  recommended: boolean;
  label: string;
}

export interface PrivateHistoryRecoveryRequest {
  recoveryRequestId: string;
  tinCommitment: string;
  requestingDeviceId: string;
  requestingDeviceEncryptionKeyFingerprint: string;
  scope: HistoryRecoveryScope;
  selectedReceiptIds?: string[];
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  status: "awaiting-approval" | "approved" | "completed" | "expired" | "revoked";
}

export function detectHistoricalPrivateRecords(
  inventory: PrivateHistoryInventory,
): PrivateHistoryState {
  if (inventory.historicalReceiptCount === 0) return { status: "none" };
  if (inventory.accessibleHistoricalReceiptCount === inventory.historicalReceiptCount) {
    return { status: "available" };
  }
  if (inventory.activeApprovingDeviceCount > 0 || inventory.activeRecoveryCredentialCount > 0) {
    return {
      status: "recovery-required",
      message: "Historical private records found. Authorize secure recovery to restore access on this device.",
    };
  }
  return {
    status: "recovery-unavailable",
    message: "Historical private records cannot be restored because no authorized device or recovery credential is available.",
  };
}

export function getRecoveryOptions(inventory: PrivateHistoryInventory): RecoveryOption[] {
  const options: RecoveryOption[] = [];
  if (inventory.activeApprovingDeviceCount > 0) {
    options.push({ method: "authorized-device", recommended: true, label: "Approve from another device" });
  }
  if (inventory.activeRecoveryCredentialCount > 0) {
    options.push({ method: "recovery-credential", recommended: options.length === 0, label: "Use recovery passkey" });
  }
  return options;
}

export function validateRecoveryScope(request: PrivateHistoryRecoveryRequest): { valid: true } | { valid: false; reason: string } {
  if (request.scope === "selected" && (!request.selectedReceiptIds || request.selectedReceiptIds.length === 0)) {
    return { valid: false, reason: "selected-recovery-requires-receipts" };
  }
  if (request.scope !== "selected" && request.selectedReceiptIds?.length) {
    return { valid: false, reason: "receipt-selection-does-not-match-scope" };
  }
  if (Date.parse(request.expiresAt) <= Date.parse(request.issuedAt)) {
    return { valid: false, reason: "invalid-recovery-expiry" };
  }
  return { valid: true };
}
