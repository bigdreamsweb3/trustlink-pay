import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export type TsnIntentStatus = "pending" | "escrowed" | "onchain" | "claimed" | "executed" | "settled" | "expired" | "failed" | "canceled" | "reverted";
export type TsnClaimRequestStatus = "pending" | "processing" | "completed" | "failed" | "canceled";
export type TsnUiStage = "intent_pending" | "claim_requested" | "escrowed" | "lease_claimed" | "cranker_paid" | "epoch_settled" | "reverted";

export type PaymentIntentStatus = "pending" | "escrowed" | "onchain" | "claimed" | "executed" | "settled" | "expired" | "failed" | "canceled" | "reverted";
export type ClaimRequestStatus = "pending" | "processing" | "completed" | "canceled" | "failed";

export interface PaymentIntentRecord {
  id: string;
  payment_id: string;
  intent_seed_hash: string;
  recipient_hash: string;
  token_mint_address: string | null;
  amount: string;
  status: PaymentIntentStatus;
  assigned_cranker_pubkey: string | null;
  lease_expiry_at: string | null;
  escrow_tx_sig: string | null;
  claim_tx_sig: string | null;
  proof_tx_sig: string | null;
  created_at: string;
}

export interface ClaimRequestRecord {
  id: string;
  payment_id: string;
  intent_id: string;
  recipient_hash: string;
  destination_wallet: string | null;
  autoclaim: boolean;
  status: ClaimRequestStatus;
  requested_at: string;
  updated_at: string;
}

export type CreateIntentRequest = {
  paymentId: string;
  underlyingPayment?: string | null;
  senderWallet?: string | null;
  senderAuthorizationMessage?: string | null;
  senderAuthorizationSignature?: string | null;
  senderAuthorizationNonce?: string | null;
  senderAuthorizationIssuedAt?: string | null;
  senderAuthorizationExpiresAt?: string | null;
  senderFeeAmount?: number | null;
  senderSignedSettlementTransaction?: string | null;
  senderSignedSettlementFeePayer?: string | null;
  senderSettlementMode?: "sponsored_sender_cosigned" | string | null;
  privacyVersion?: number | null;
  commitmentRecord?: string | null;
  senderTokenAccount?: string | null;
  settlementVault?: string | null;
  settlementTokenAccount?: string | null;
  settlementPaymentIntentId?: string | null;
  transferId?: string | null;
  commitmentHash?: string | null;
  settlementEpoch?: number | null;
  encryptedSettlementToken?: {
    algorithm: "x25519-xsalsa20-poly1305";
    ciphertextBase64: string;
    nonceBase64: string;
    ephemeralPublicKeyBase64: string;
    commitmentHash: string;
    transferId: string;
    epoch: number;
  } | null;
  intentSeedHash: string;
  recipientHash: string;
  tokenMintAddress: string;
  amount: number;
  recipientAmount?: number;
  source?: string;
};

export type RequestClaimRequest = {
  paymentId: string;
  intentId: string;
  recipientHash: string;
  destinationWallet?: string | null;
  autoclaim: boolean;
  source?: string;
};

export type TsnMempoolIntent = CreateIntentRequest & {
  id: string;
  status: TsnIntentStatus;
  assignedCrankerPubkey?: string | null;
  escrowTxSig?: string | null;
  claimTxSig?: string | null;
  proofTxSig?: string | null;
  settlementResolution?: "completed" | "reverted" | null;
  settlementReason?: string | null;
  postedAt: string;
  updatedAt: string;
};

export type TsnMempoolClaimRequest = RequestClaimRequest & {
  id: string;
  status: TsnClaimRequestStatus;
  assignedCrankerPubkey?: string | null;
  leaseExpiresAt?: string | null;
  settlementReason?: string | null;
  postedAt: string;
  updatedAt: string;
};

export type TsnWorkItem = {
  intent: TsnMempoolIntent;
  claimRequest: TsnMempoolClaimRequest;
};

export type TsnIntentWorkItem = {
  intent: TsnMempoolIntent;
};

export type ProofOfPaymentRequest = {
  intent_id: string;
  timestamp: string;
  cranker_pubkey: string;
  proof_tx: string;
  encrypted_payload?: string | null;
  transfer_id?: string | null;
  commitment_hash?: string | null;
  otdt_hash?: string | null;
};

export type TsnRecoveryStatus = "pending" | "leased" | "completed" | "failed" | "canceled";

export type TsnEpochChallengeStatus = "open" | "submitted" | "completed" | "failed";

export type TsnEpochChallenge = {
  id: string;
  epoch: number;
  tokenMintAddress?: string | null;
  epochAccount?: string | null;
  pea?: string | null;
  rootHash: string;
  totalToDistribute: string;
  crankerCreditSumMod: string;
  status: TsnEpochChallengeStatus;
  winnerCrankerPubkey?: string | null;
  reimbursementTxSig?: string | null;
  settlementReason?: string | null;
  postedAt: string;
  updatedAt: string;
};

export type TsnRecoveryWorkItem = {
  id: string;
  paymentId?: string;
  transferId?: string;
  paymentIntentId?: string;
  settlementVault?: string;
  settlementTokenAccount?: string;
  tokenMintAddress: string;
  settlementCrankerPubkey?: string;
  privacyVersion?: number | null;
  amount: number;
  epoch: number;
  rewardLamports: number;
  priorityScore: number;
  status: TsnRecoveryStatus;
  assignedCrankerPubkey?: string | null;
  leaseExpiresAt?: string | null;
  recoveryTxSig?: string | null;
  settlementReason?: string | null;
  postedAt: string;
  updatedAt: string;
};

export type IntentState = {
  status: TsnIntentStatus;
};

export type ClaimRequestState = {
  status: TsnClaimRequestStatus;
} | null;

export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}

export function buildCreateIntentRequest(params: {
  paymentId: string;
  underlyingPayment?: string | null;
  senderWallet?: string | null;
  senderAuthorizationMessage?: string | null;
  senderAuthorizationSignature?: string | null;
  senderAuthorizationNonce?: string | null;
  senderAuthorizationIssuedAt?: string | null;
  senderAuthorizationExpiresAt?: string | null;
  senderFeeAmount?: number | null;
  senderSignedSettlementTransaction?: string | null;
  senderSignedSettlementFeePayer?: string | null;
  senderSettlementMode?: "sponsored_sender_cosigned" | string | null;
  privacyVersion?: number | null;
  commitmentRecord?: string | null;
  senderTokenAccount?: string | null;
  settlementVault?: string | null;
  settlementTokenAccount?: string | null;
  settlementPaymentIntentId?: string | null;
  transferId?: string | null;
  commitmentHash?: string | null;
  settlementEpoch?: number | null;
  encryptedSettlementToken?: CreateIntentRequest["encryptedSettlementToken"];
  recipientHash: string;
  tokenMintAddress: string;
  amount: number;
  source?: string;
}): CreateIntentRequest {
  return {
    paymentId: params.paymentId,
    underlyingPayment: params.underlyingPayment ?? null,
    senderWallet: params.senderWallet ?? null,
    senderAuthorizationMessage: params.senderAuthorizationMessage ?? null,
    senderAuthorizationSignature: params.senderAuthorizationSignature ?? null,
    senderAuthorizationNonce: params.senderAuthorizationNonce ?? null,
    senderAuthorizationIssuedAt: params.senderAuthorizationIssuedAt ?? null,
    senderAuthorizationExpiresAt: params.senderAuthorizationExpiresAt ?? null,
    senderFeeAmount: params.senderFeeAmount ?? null,
    senderSignedSettlementTransaction: params.senderSignedSettlementTransaction ?? null,
    senderSignedSettlementFeePayer: params.senderSignedSettlementFeePayer ?? null,
    senderSettlementMode: params.senderSettlementMode ?? null,
    privacyVersion: params.privacyVersion ?? null,
    commitmentRecord: params.commitmentRecord ?? null,
    senderTokenAccount: params.senderTokenAccount ?? null,
    settlementVault: params.settlementVault ?? null,
    settlementTokenAccount: params.settlementTokenAccount ?? null,
    settlementPaymentIntentId: params.settlementPaymentIntentId ?? null,
    transferId: params.transferId ?? null,
    commitmentHash: params.commitmentHash ?? null,
    settlementEpoch: params.settlementEpoch ?? null,
    encryptedSettlementToken: params.encryptedSettlementToken ?? null,
    intentSeedHash: sha256Hex(params.paymentId),
    recipientHash: params.recipientHash,
    tokenMintAddress: params.tokenMintAddress,
    amount: params.amount,
    source: params.source,
  };
}

export function buildRequestClaimRequest(params: RequestClaimRequest): RequestClaimRequest {
  return params;
}

export function computeTsnUiStage(intent: IntentState, claimRequest: ClaimRequestState): TsnUiStage {
  if (intent.status === "reverted" || intent.status === "failed" || intent.status === "canceled" || intent.status === "expired") return "reverted";
  if (claimRequest && (claimRequest.status === "failed" || claimRequest.status === "canceled")) return "reverted";
  if (intent.status === "settled") return "epoch_settled";
  if (intent.status === "executed") return "cranker_paid";
  if (intent.status === "claimed") return "lease_claimed";
  if (intent.status === "escrowed" || intent.status === "onchain") return "escrowed";
  if (intent.status === "pending") return "intent_pending";

  if (claimRequest && (claimRequest.status === "pending" || claimRequest.status === "processing")) {
    return "claim_requested";
  }

  return "intent_pending";
}
