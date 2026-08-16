import {
  buildCreateIntentRequest,
  type CreateIntentRequest,
  type TsnMempoolClaimRequest,
  type TsnMempoolIntent,
} from "./contracts.js";
import {
  buildMixedPaymentMessage,
  buildPaymentIntentMessage,
  buildPruSpendMessage,
} from "./canonical-message.js";
import { TsnHttpClient } from "./client.js";

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
  fundingMode?: "zk_pru_only_v2" | "mixed_zk_pru_wallet_v2" | "wallet_only_v2";
  pruPortionBaseUnits?: bigint | number | string;
  walletTopUpPortionBaseUnits?: bigint | number | string;
}) {
  const recipientTin =
    params.receiverIdentity.match(/(?:^|\|)tin:(\d+)/)?.[1] ??
    params.receiverIdentity.match(/^tin:(\d+)/)?.[1];
  if (!recipientTin) {
    throw new Error(
      "recipient TIN is required for canonical TSN payment authorization",
    );
  }
  const amountBaseUnits = BigInt(Math.round(params.amount * 1_000_000));
  const feeBaseUnits = BigInt(Math.round(params.senderFeeAmount * 1_000_000));
  const usesMixedFunding = params.fundingMode === "mixed_zk_pru_wallet_v2";
  const usesPruFunding = params.fundingMode === "zk_pru_only_v2";
  if (usesMixedFunding) {
    return buildMixedPaymentMessage({
      amountBaseUnits,
      recipientTin,
      feeBaseUnits,
      pruPortionBaseUnits: BigInt(params.pruPortionBaseUnits ?? 0),
      walletTopUpPortionBaseUnits: BigInt(
        params.walletTopUpPortionBaseUnits ?? 0,
      ),
      nonce: params.nonce ?? "",
      expires:
        params.expiresAt ?? new Date(Date.now() + 5 * 60_000).toISOString(),
    });
  }
  if (usesPruFunding) {
    return buildPruSpendMessage({
      amountBaseUnits,
      recipientTin,
      feeBaseUnits,
      nonce: params.nonce ?? "",
      expires:
        params.expiresAt ?? new Date(Date.now() + 5 * 60_000).toISOString(),
    });
  }
  return buildPaymentIntentMessage({
    amountBaseUnits,
    recipientTin,
    feeBaseUnits,
    sender: "Main Wallet",
    nonce: params.nonce ?? "",
    expires:
      params.expiresAt ?? new Date(Date.now() + 5 * 60_000).toISOString(),
  });
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
  fundingMode?: "zk_pru_only_v2" | "mixed_zk_pru_wallet_v2" | "wallet_only_v2";
  pruPortionBaseUnits?: bigint | number | string;
  walletTopUpPortionBaseUnits?: bigint | number | string;
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
  recipientTin?: string | null;
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
  pruSpendTin?: string | null;
  pruSpendAmountBaseUnits?: string | null;
  pruSpendSenderFeeBaseUnits?: string | null;
  walletTopUpAmountBaseUnits?: string | null;
  walletTopUpSenderFeeBaseUnits?: string | null;
  pruSpendSelections?: CreateIntentRequest["pruSpendSelections"];
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
      senderSignedSettlementTransaction:
        params.senderSignedSettlementTransaction,
      senderSignedSettlementFeePayer: params.senderSignedSettlementFeePayer,
      senderSettlementMode: params.senderSettlementMode,
      pruSpendTin: params.pruSpendTin,
      pruSpendAmountBaseUnits: params.pruSpendAmountBaseUnits,
      pruSpendSenderFeeBaseUnits: params.pruSpendSenderFeeBaseUnits,
      walletTopUpAmountBaseUnits: params.walletTopUpAmountBaseUnits,
      walletTopUpSenderFeeBaseUnits: params.walletTopUpSenderFeeBaseUnits,
      pruSpendSelections: params.pruSpendSelections,
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
      recipientTin: params.recipientTin,
      tokenMintAddress: params.tokenMintAddress,
      amount: params.amount,
      source: params.source,
    }),
    ...(params.recipientAmount == null
      ? {}
      : { recipientAmount: params.recipientAmount }),
  };
}

export async function submitPaymentAuthorizationToMempool(params: {
  mempoolUrl: string;
  fetchImpl?: typeof fetch;
  paymentId: string;
  recipientHash: string;
  recipientTin?: string | null;
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
  pruSpendTin?: string | null;
  pruSpendAmountBaseUnits?: string | null;
  pruSpendSenderFeeBaseUnits?: string | null;
  walletTopUpAmountBaseUnits?: string | null;
  walletTopUpSenderFeeBaseUnits?: string | null;
  pruSpendSelections?: CreateIntentRequest["pruSpendSelections"];
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
  const intent = await client.postIntent<CreateIntentRequest, TsnMempoolIntent>(
    intentRequest,
  );
  // Claim work is deliberately not created by the sender device.  A claim is
  // only valid after the TSN Node has verified this payment and a Cranker has
  // confirmed the immutable funding transaction.  The Receiver creates that
  // next work item atomically from the CONFIRMED payment transition.
  const claimRequest: TsnMempoolClaimRequest | null = null;

  return {
    intentRequest,
    intent,
    claimRequest,
  };
}
