import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export type TsnIntentStatus = "pending" | "onchain" | "executed" | "settled" | "expired" | "failed" | "canceled" | "reverted";
export type TsnUiStage = "intent_pending" | "funded" | "lease_claimed" | "cranker_paid" | "epoch_settled" | "reverted";

export type PaymentIntentStatus = TsnIntentStatus;

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
  funding_tx_sig: string | null;
  settlement_tx_sig: string | null;
  created_at: string;
}

export type CreateIntentRequest = {
  paymentId: string;
  intentSeedHash: string;
  recipientHash: string;
  recipientTin: string;
  tokenMintAddress: string;
  amount: number;
  senderWallet: string;
  senderAuthorizationMessage: string;
  senderAuthorizationSignature: string;
  senderAuthorizationNonce: string;
  senderAuthorizationIssuedAt?: string | null;
  senderAuthorizationExpiresAt?: string | null;
  senderFeeAmount?: number | null;
  senderSignedFundingTransaction: string;
  senderFundingMode: "tcap_deposit_v2";
  recipientAmount?: number;
  source?: string;
  destinationNetwork?: string | null;
  destinationExecutor?: string | null;
  destinationToken?: string | null;
  settlementRouteId?: string | null;
};

export type TsnMempoolIntent = CreateIntentRequest & {
  id: string;
  status: TsnIntentStatus;
  assignedCrankerPubkey?: string | null;
  fundingTxSig?: string | null;
  settlementTxSig?: string | null;
  settlementResolution?: "completed" | "reverted" | null;
  settlementReason?: string | null;
  postedAt: string;
  updatedAt: string;
};

export type PublicTsnMempoolIntent = Pick<
  TsnMempoolIntent,
  | "id"
  | "paymentId"
  | "intentSeedHash"
  | "recipientHash"
  | "tokenMintAddress"
  | "amount"
  | "recipientAmount"
  | "source"
  | "status"
  | "assignedCrankerPubkey"
  | "fundingTxSig"
  | "settlementTxSig"
  | "settlementResolution"
  | "settlementReason"
  | "postedAt"
  | "updatedAt"
>;

export type TsnIntentWorkItem = {
  intent: TsnMempoolIntent;
};

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

export type IntentState = {
  status: TsnIntentStatus;
};

export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}

function normalizeRecipientHash(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("recipientHash must be the 32-byte hexadecimal hash returned by TSN Node TIN resolution");
  }
  return normalized;
}

export function buildCreateIntentRequest(params: {
  paymentId: string;
  recipientHash: string;
  recipientTin: string;
  tokenMintAddress: string;
  amount: number;
  senderWallet: string;
  senderAuthorizationMessage: string;
  senderAuthorizationSignature: string;
  senderAuthorizationNonce: string;
  senderAuthorizationIssuedAt?: string | null;
  senderAuthorizationExpiresAt?: string | null;
  senderFeeAmount?: number | null;
  senderSignedFundingTransaction: string;
  senderFundingMode: "tcap_deposit_v2";
  recipientAmount?: number;
  destinationNetwork?: string | null;
  destinationExecutor?: string | null;
  destinationToken?: string | null;
  settlementRouteId?: string | null;
  source?: string;
}): CreateIntentRequest {
  return {
    paymentId: params.paymentId,
    intentSeedHash: sha256Hex(params.paymentId),
    recipientHash: normalizeRecipientHash(params.recipientHash),
    recipientTin: params.recipientTin,
    tokenMintAddress: params.tokenMintAddress,
    amount: params.amount,
    senderWallet: params.senderWallet,
    senderAuthorizationMessage: params.senderAuthorizationMessage,
    senderAuthorizationSignature: params.senderAuthorizationSignature,
    senderAuthorizationNonce: params.senderAuthorizationNonce,
    senderAuthorizationIssuedAt: params.senderAuthorizationIssuedAt,
    senderAuthorizationExpiresAt: params.senderAuthorizationExpiresAt,
    senderFeeAmount: params.senderFeeAmount,
    senderSignedFundingTransaction: params.senderSignedFundingTransaction,
    senderFundingMode: params.senderFundingMode,
    recipientAmount: params.recipientAmount,
    destinationNetwork: params.destinationNetwork,
    destinationExecutor: params.destinationExecutor,
    destinationToken: params.destinationToken,
    settlementRouteId: params.settlementRouteId,
    source: params.source,
  };
}

export function computeTsnUiStage(intent: IntentState): TsnUiStage {
  if (intent.status === "reverted" || intent.status === "failed" || intent.status === "canceled" || intent.status === "expired") return "reverted";
  if (intent.status === "settled") return "epoch_settled";
  if (intent.status === "executed") return "cranker_paid";
  if (intent.status === "onchain") return "funded";
  if (intent.status === "pending") return "intent_pending";

  return "intent_pending";
}
