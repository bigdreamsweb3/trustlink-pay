import { createHash } from "node:crypto";

export type TsnIntentStatus = "pending" | "claimed" | "executed" | "settled" | "expired" | "failed" | "canceled";
export type TsnClaimRequestStatus = "pending" | "processing" | "completed" | "failed" | "canceled";
export type TsnUiStage = "intent_pending" | "claim_requested" | "lease_claimed" | "cranker_paid" | "epoch_settled";

export type CreateIntentRequest = {
  paymentId: string;
  underlyingPayment?: string | null;
  intentSeedHash: string;
  recipientHash: string;
  tokenMintAddress: string;
  amount: number;
  source?: string;
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
  postedAt: string;
  updatedAt: string;
};

export type TsnMempoolClaimRequest = RequestClaimRequest & {
  id: string;
  status: TsnClaimRequestStatus;
  postedAt: string;
  updatedAt: string;
};

export type TsnWorkItem = {
  intent: TsnMempoolIntent;
  claimRequest: TsnMempoolClaimRequest;
};

export type IntentState = {
  status: TsnIntentStatus;
};

export type ClaimRequestState = {
  status: TsnClaimRequestStatus;
} | null;

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256Bytes(input: string): Buffer {
  return createHash("sha256").update(input).digest();
}

export function buildCreateIntentRequest(params: {
  paymentId: string;
  underlyingPayment?: string | null;
  recipientHash: string;
  tokenMintAddress: string;
  amount: number;
  source?: string;
}): CreateIntentRequest {
  return {
    paymentId: params.paymentId,
    underlyingPayment: params.underlyingPayment ?? null,
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
  if (intent.status === "settled") return "epoch_settled";
  if (intent.status === "executed") return "cranker_paid";
  if (intent.status === "claimed") return "lease_claimed";

  if (claimRequest && (claimRequest.status === "pending" || claimRequest.status === "processing")) {
    return "claim_requested";
  }

  return "intent_pending";
}
