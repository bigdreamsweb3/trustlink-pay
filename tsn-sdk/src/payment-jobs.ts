import {
  buildCreateIntentRequest,
  buildRequestClaimRequest,
  type CreateIntentRequest,
  type RequestClaimRequest,
} from "./contracts.js";
import type { TsnMempool } from "./mempool.js";
import {
  createSenderPaymentAuthorizationMessage,
} from "./payment-authorization.js";
import { verifySenderPaymentAuthorization } from "./payment-authorization-server.js";

export type TsnSenderBalance = {
  balance: number;
  symbol?: string | null;
};

export async function verifyAuthorizedTsnPaymentRequest(params: {
  senderWallet: string;
  senderIdentity: string;
  receiverIdentity: string;
  tokenMintAddress: string;
  amount: number;
  senderFeeAmount: number;
  totalTokenRequiredUi: number;
  issuedAt: string;
  nonce?: string;
  expiresAt?: string;
  signatureBase64: string;
  maxAgeMs?: number;
  getSenderTokenBalance?: (params: {
    senderWallet: string;
    tokenMintAddress: string;
  }) => Promise<TsnSenderBalance>;
}) {
  const maxAgeMs = params.maxAgeMs ?? 5 * 60 * 1000;
  const issuedAtMs = Date.parse(params.issuedAt);
  if (!Number.isFinite(issuedAtMs) || Math.abs(Date.now() - issuedAtMs) > maxAgeMs) {
    throw new Error("Sender wallet authorization expired. Please review and sign again.");
  }

  const message = createSenderPaymentAuthorizationMessage({
    senderWallet: params.senderWallet,
    senderIdentity: params.senderIdentity,
    receiverIdentity: params.receiverIdentity,
    tokenMintAddress: params.tokenMintAddress,
    amount: params.amount,
    senderFeeAmount: params.senderFeeAmount,
    totalTokenRequiredUi: params.totalTokenRequiredUi,
    nonce: params.nonce,
    issuedAt: params.issuedAt,
    expiresAt: params.expiresAt,
  });

  const valid = await verifySenderPaymentAuthorization({
    senderWallet: params.senderWallet,
    signatureBase64: params.signatureBase64,
    message,
  });
  if (!valid) {
    throw new Error("Sender wallet authorization signature is invalid");
  }

  if (params.getSenderTokenBalance) {
    const senderToken = await params.getSenderTokenBalance({
      senderWallet: params.senderWallet,
      tokenMintAddress: params.tokenMintAddress,
    });
    if (senderToken.balance < params.totalTokenRequiredUi) {
      throw new Error(
        `Insufficient ${senderToken.symbol ?? "token"} balance. Required ${params.totalTokenRequiredUi}, available ${senderToken.balance}.`,
      );
    }
  }

  return { message };
}

export async function createTsnPaymentMempoolJobs(params: {
  mempool: TsnMempool;
  paymentId: string;
  underlyingPayment?: string | null;
  recipientHash: string;
  tokenMintAddress: string;
  amount: number;
  senderFeeAmount?: number | null;
  recipientAmount?: number;
  destinationWallet: string;
  source?: string;
}) {
  const requests = prepareTsnPaymentMempoolJobRequests(params);
  const intent = await params.mempool.postIntent(requests.intentRequest);
  const claimRequest = await params.mempool.postClaimRequest({
    ...requests.claimRequestPayload,
    intentId: intent.id,
  });

  return {
    ...requests,
    claimRequestPayload: {
      ...requests.claimRequestPayload,
      intentId: intent.id,
    },
    intent,
    claimRequest,
  };
}

export function prepareTsnPaymentMempoolJobRequests(params: {
  paymentId: string;
  underlyingPayment?: string | null;
  recipientHash: string;
  tokenMintAddress: string;
  amount: number;
  senderFeeAmount?: number | null;
  recipientAmount?: number;
  destinationWallet: string;
  source?: string;
}) {
  const intentRequest = {
    ...buildCreateIntentRequest({
      paymentId: params.paymentId,
      underlyingPayment: params.underlyingPayment,
      recipientHash: params.recipientHash,
      tokenMintAddress: params.tokenMintAddress,
      amount: params.amount,
      senderFeeAmount: params.senderFeeAmount,
      source: params.source,
    }),
    ...(params.recipientAmount == null ? {} : { recipientAmount: params.recipientAmount }),
  } as CreateIntentRequest;

  const claimRequestPayload = buildRequestClaimRequest({
    paymentId: params.paymentId,
    intentId: intentRequest.paymentId,
    recipientHash: params.recipientHash,
    destinationWallet: params.destinationWallet,
    autoclaim: false,
    source: params.source,
  });

  return {
    intentRequest,
    claimRequestPayload: claimRequestPayload as RequestClaimRequest,
  };
}
