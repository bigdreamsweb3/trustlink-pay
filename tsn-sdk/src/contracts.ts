import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export type TsnIntentStatus = "pending" | "escrowed" | "onchain" | "claimed" | "executed" | "settled" | "expired" | "failed" | "canceled" | "reverted";
export type TsnClaimRequestStatus = "pending" | "processing" | "completed" | "failed" | "canceled";
export type TsnLeaseStatus = "active" | "completed" | "expired" | "canceled";
export type TsnRecoveryJobStatus = "open" | "leased" | "completed" | "failed" | "canceled";
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
  senderTokenAccount?: string | null;
  settlementVault?: string | null;
  settlementTokenAccount?: string | null;
  settlementPaymentIntentId?: string | null;
  intentSeedHash: string;
  recipientHash: string;
  tokenMintAddress: string;
  amount: number;
  recipientAmount?: number;
  source?: string;
  epoch?: number;
  encryptedSettlementToken?: string;
  settlementTokenCommitmentHash?: string;
  commitmentRegistryEntry?: CommitmentRegistryEntry;
};

export type CommitmentRegistryEntry = {
  transferId: string;
  encryptedSettlementToken: string;
  commitmentHash: string;
  timestamp: string;
  epoch: number;
  recoverable: boolean;
  intentVerifierPubkey?: string | null;
  settlementCommitmentHash?: string | null;
  settlementProofTx?: string | null;
  otdtHash?: string | null;
  recoveryProofTx?: string | null;
  updatedAt?: string;
};

export type ClaimPointLedgerEntry = {
  crankerPubkey: string;
  earned: number;
  available: number;
  leased: number;
  lastIntentWorkAt?: string | null;
};

export type ClaimLeaseRecord = {
  id: string;
  transferId: string;
  crankerPubkey: string;
  status: TsnLeaseStatus;
  pointsSpent: number;
  otdtHash?: string | null;
  issuedAt: string;
  expiresAt: string;
  completedAt?: string | null;
};

export type RecoveryQueueEntry = {
  id: string;
  transferId: string;
  epoch: number;
  recoverableAmount: number;
  vaultSource: string;
  recoveryReward: number;
  priorityScore: number;
  status: TsnRecoveryJobStatus;
  leasedByCrankerPubkey?: string | null;
  leaseExpiresAt?: string | null;
  proofTx?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LiquidityMetrics = {
  activeLiquidity: number;
  pendingIntentAmount: number;
  vaultBalance: number;
  settlementVelocity: number;
  liquidityConsumptionRate: number;
  lowLiquidityThreshold: number;
  updatedAt: string;
};

export type RequestClaimRequest = {
  paymentId: string;
  intentId: string;
  recipientHash: string;
  destinationWallet: string;
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
  claimLeaseId?: string | null;
  postedAt: string;
  updatedAt: string;
};

export type TsnMempoolClaimRequest = RequestClaimRequest & {
  id: string;
  status: TsnClaimRequestStatus;
  settlementReason?: string | null;
  claimLeaseId?: string | null;
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
  settlement_commitment_hash?: string | null;
  otdt_hash?: string | null;
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
  senderTokenAccount?: string | null;
  settlementVault?: string | null;
  settlementTokenAccount?: string | null;
  settlementPaymentIntentId?: string | null;
  recipientHash: string;
  tokenMintAddress: string;
  amount: number;
  source?: string;
  epoch?: number;
  encryptedSettlementToken?: string;
  settlementTokenCommitmentHash?: string;
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
    senderTokenAccount: params.senderTokenAccount ?? null,
    settlementVault: params.settlementVault ?? null,
    settlementTokenAccount: params.settlementTokenAccount ?? null,
    settlementPaymentIntentId: params.settlementPaymentIntentId ?? null,
    intentSeedHash: sha256Hex(params.paymentId),
    recipientHash: params.recipientHash,
    tokenMintAddress: params.tokenMintAddress,
    amount: params.amount,
    source: params.source,
    epoch: params.epoch,
    encryptedSettlementToken: params.encryptedSettlementToken,
    settlementTokenCommitmentHash: params.settlementTokenCommitmentHash,
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
