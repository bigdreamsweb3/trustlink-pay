import { randomUUID } from "node:crypto";
import type { WorkKind, WorkCreationDependencies } from "./models";

export const AUTHORIZED_FUNDING_KEYS = new Set([
  "paymentId", "intentSeedHash", "recipientHash", "recipientTin",
  "tokenMintAddress", "amount", "recipientAmount", "senderWallet", "senderAuthorizationMessage",
  "senderAuthorizationSignature", "senderAuthorizationNonce", "senderAuthorizationIssuedAt", "senderAuthorizationExpiresAt",
  "senderFeeAmount", "senderSignedFundingTransaction", "senderFundingMode", "senderFundingBlockhashContext",
  "fundingNote",
  "destinationNetwork", "destinationExecutor", "destinationToken", "settlementRouteId",
  "source",
]);

export const PAYMENT_AUTHORIZATION_KEYS = new Set(AUTHORIZED_FUNDING_KEYS);
PAYMENT_AUTHORIZATION_KEYS.delete("senderSignedFundingTransaction");
PAYMENT_AUTHORIZATION_KEYS.delete("senderFundingBlockhashContext");

export const INTERNAL_KEYS: Record<WorkKind, Set<string>> = {
  AUTHORIZED_FUNDING: new Set(["paymentId", "recipientHash", "tokenMintAddress", "amount", "nodeEncryptedPayload"]),
  TCAP_EPOCH_ACCOUNTING: new Set(["assetEntry", "reserveState", "tcapConfig", "accountingEpoch"]),
  TIN_DEBIT: new Set(["paymentId", "nodeEncryptedPayload"]),
  SETTLEMENT: new Set(["paymentId", "intentId", "recipientHash", "source", "nodeEncryptedPayload"]),
  // Exact private TIN V1 creation payload accepted from the SDK.
  TIN_OPERATION: new Set([
    "intentType", "intentId", "ownerPubkey", "ownerSignature",
    "ownerIntentHash", "ownerIntentMessage", "nonce", "expiry",
    "lookupCommitment", "lookupIssuanceProof", "encryptedIdentityEnvelope",
    "encryptedTinRecovery", "encryptedMasterSeed", "encryptedMetadataHash",
    "routeVersion", "routeNonce", "tipRouteVersion",
    "gpruElgamalKeyVersion", "gpruElgamalPublicKey", "gpruElgamalKeyCommitment",
    "gpruBalanceScanKeyVersion", "gpruBalanceScanPublicKeyX", "gpruBalanceScanPublicKeyY",
    "policyCommitment",
  ]),
};

/** Preserve native current-time and random identity behavior without mutable application state. */
export const DEFAULT_WORK_CREATION_DEPENDENCIES: WorkCreationDependencies = { clock: Date, randomUUID };
