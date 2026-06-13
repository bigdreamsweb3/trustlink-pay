import {
  buildCreateIntentRequest,
  type CreateIntentRequest,
  type RequestClaimRequest,
  type TsnMempoolClaimRequest,
  type TsnMempoolIntent,
} from "./contracts.js";
import { TsnHttpClient } from "./client.js";

function formatPaymentNumber(value: number) {
  return Number(value.toFixed(9)).toString();
}

export function createSenderPaymentAuthorizationMessage(params: {
  senderWallet: string;
  senderIdentity: string;
  receiverIdentity: string;
  tokenMintAddress: string;
  amount: number;
  senderFeeAmount: number;
  totalTokenRequiredUi: number;
  nonce?: string;
  issuedAt: string;
  expiresAt?: string;
}) {
  return [
    "Transfer Settlement Network Payment Authorization",
    "version=1",
    `senderWallet=${params.senderWallet}`,
    `senderIdentity=${params.senderIdentity}`,
    `receiverIdentity=${params.receiverIdentity}`,
    `tokenMintAddress=${params.tokenMintAddress}`,
    `amount=${formatPaymentNumber(params.amount)}`,
    `senderFeeAmount=${formatPaymentNumber(params.senderFeeAmount)}`,
    `totalTokenRequiredUi=${formatPaymentNumber(params.totalTokenRequiredUi)}`,
    `nonce=${params.nonce ?? ""}`,
    `issuedAt=${params.issuedAt}`,
    `expiresAt=${params.expiresAt ?? ""}`,
  ].join("\n");
}

export function createPaymentAuthorizationNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function createPaymentAuthorizationExpiry(ttlMs = 5 * 60_000) {
  return new Date(Date.now() + ttlMs).toISOString();
}

export function createPaymentAuthorization(params: {
  senderWallet: string;
  senderIdentity: string;
  receiverIdentity: string;
  tokenMintAddress: string;
  amount: number;
  senderFeeAmount: number;
  totalTokenRequiredUi: number;
  nonce?: string;
  issuedAt?: string;
  expiresAt?: string;
}) {
  const nonce = params.nonce ?? createPaymentAuthorizationNonce();
  const issuedAt = params.issuedAt ?? new Date().toISOString();
  const expiresAt = params.expiresAt ?? createPaymentAuthorizationExpiry();
  const message = createSenderPaymentAuthorizationMessage({
    ...params,
    nonce,
    issuedAt,
    expiresAt,
  });

  return {
    message,
    nonce,
    issuedAt,
    expiresAt,
  };
}

export function buildPaymentAuthorizationIntentRequest(params: {
  paymentId: string;
  recipientHash: string;
  tokenMintAddress: string;
  senderWallet: string;
  senderAuthorizationMessage: string;
  senderAuthorizationSignature: string;
  senderAuthorizationNonce: string;
  senderAuthorizationIssuedAt: string;
  senderAuthorizationExpiresAt: string;
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
  amount: number;
  recipientAmount?: number;
  source?: string;
}): CreateIntentRequest {
  return {
    ...buildCreateIntentRequest({
      paymentId: params.paymentId,
      underlyingPayment: params.senderWallet,
      senderWallet: params.senderWallet,
      senderAuthorizationMessage: params.senderAuthorizationMessage,
      senderAuthorizationSignature: params.senderAuthorizationSignature,
      senderAuthorizationNonce: params.senderAuthorizationNonce,
      senderAuthorizationIssuedAt: params.senderAuthorizationIssuedAt,
      senderAuthorizationExpiresAt: params.senderAuthorizationExpiresAt,
      senderFeeAmount: params.senderFeeAmount,
      senderSignedSettlementTransaction: params.senderSignedSettlementTransaction,
      senderSignedSettlementFeePayer: params.senderSignedSettlementFeePayer,
      senderSettlementMode: params.senderSettlementMode,
      privacyVersion: params.privacyVersion,
      commitmentRecord: params.commitmentRecord,
      senderTokenAccount: params.senderTokenAccount,
      settlementVault: params.settlementVault,
      settlementTokenAccount: params.settlementTokenAccount,
      settlementPaymentIntentId: params.settlementPaymentIntentId,
      transferId: params.transferId,
      commitmentHash: params.commitmentHash,
      settlementEpoch: params.settlementEpoch,
      encryptedSettlementToken: params.encryptedSettlementToken,
      recipientHash: params.recipientHash,
      tokenMintAddress: params.tokenMintAddress,
      amount: params.amount,
      source: params.source,
    }),
    ...(params.recipientAmount == null ? {} : { recipientAmount: params.recipientAmount }),
  };
}

export async function submitPaymentAuthorizationToMempool(params: {
  mempoolUrl: string;
  fetchImpl?: typeof fetch;
  paymentId: string;
  recipientHash: string;
  tokenMintAddress: string;
  senderWallet: string;
  senderAuthorizationMessage: string;
  senderAuthorizationSignature: string;
  senderAuthorizationNonce: string;
  senderAuthorizationIssuedAt: string;
  senderAuthorizationExpiresAt: string;
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
  amount: number;
  recipientAmount?: number;
  destinationWallet?: string | null;
  autoclaim?: boolean;
  source?: string;
}) {
  const intentRequest = buildPaymentAuthorizationIntentRequest(params);
  const client = new TsnHttpClient({
    baseUrl: params.mempoolUrl,
    fetchImpl: params.fetchImpl,
  });
  const intent = await client.postIntent<CreateIntentRequest, TsnMempoolIntent>(intentRequest);
  const claimRequest =
    params.destinationWallet
      ? await client.postClaimRequest<RequestClaimRequest, TsnMempoolClaimRequest>({
          paymentId: params.paymentId,
          intentId: intent.id,
          recipientHash: params.recipientHash,
          destinationWallet: null,
          autoclaim: params.autoclaim ?? true,
          source: params.source,
        })
      : null;

  return {
    intentRequest,
    intent,
    claimRequest,
  };
}
