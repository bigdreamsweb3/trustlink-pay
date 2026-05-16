import { PublicKey } from "@solana/web3.js";

import { getIdentityBindingState } from "@/app/blockchain/solana";
import { getAllowedTokenByMint, toBaseUnits } from "@/app/blockchain/solana-core";
import { findPaymentById } from "@/app/db/payments";
import { findReceiverWalletById } from "@/app/db/receiver-wallets";
import {
  createClaimRequest,
  findLatestActiveClaimRequestByPaymentId,
  findPaymentIntentByPaymentId,
  listLatestClaimRequestsByPaymentIds,
  listPaymentIntentsByPaymentIds,
  updatePaymentIntentStatus,
  upsertPaymentIntent,
} from "@/app/db/tsn";
import { findUserByPhoneNumber } from "@/app/db/users";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { verifyClaimProof } from "@/app/lib/privacy-keys";
import { verifyUserActionPin } from "@/app/services/auth";
import type { AuthenticatedUser } from "@/app/types/auth";
import type { PaymentRecord, PaymentTsnState, TsnUiStage } from "@/app/types/payment";
import type { ClaimRequestRecord, PaymentIntentRecord, PaymentIntentStatus } from "../../../tsn/src";
import {
  buildCreateIntentRequest,
  buildRequestClaimRequest,
  computeTsnUiStage,
  sha256Bytes,
  TsnHttpClient,
  type CreateIntentRequest,
  type RequestClaimRequest,
} from "../../../tsn/src";

function paymentCanStillBeClaimed(status: string) {
  return status === "locked" || status === "expired";
}

function resolveClaimMode(payment: { payment_mode?: string | null }) {
  return payment.payment_mode === "invite" ? "invite" : "secure";
}

function getTsnMempoolClient() {
  return new TsnHttpClient({ baseUrl: env.TSN_MEMPOOL_URL });
}

async function postIntentToTsnMempool(request: CreateIntentRequest) {
  try {
    return await getTsnMempoolClient().postIntent<CreateIntentRequest, unknown>(request);
  } catch (error) {
    logger.error("tsn.mempool.intent_post_failed", {
      paymentId: request.paymentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("TSN mempool is unavailable; start the TSN service before creating TSN intents.");
  }
}

async function postClaimRequestToTsnMempool(request: RequestClaimRequest) {
  try {
    return await getTsnMempoolClient().postClaimRequest<RequestClaimRequest, unknown>(request);
  } catch (error) {
    logger.error("tsn.mempool.claim_post_failed", {
      paymentId: request.paymentId,
      intentId: request.intentId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error("TSN mempool is unavailable; start the TSN service before requesting TSN claims.");
  }
}

export async function createTsnIntentForPayment(payment: PaymentRecord) {
  if (!env.TSN_ENABLED) {
    return { enabled: false as const };
  }

  const tokenMint = payment.token_mint_address;
  if (!tokenMint) throw new Error("Missing token mint for payment");

  const allowed = getAllowedTokenByMint(tokenMint);
  if (!allowed) throw new Error("Token mint not allowlisted for TSN intent");

  const intentRequest = buildCreateIntentRequest({
    paymentId: payment.id,
    underlyingPayment: payment.escrow_account,
    recipientHash: payment.receiver_phone_hash,
    tokenMintAddress: tokenMint,
    amount: Number(payment.amount),
    source: "trustlink-pay",
  });

  const mempoolIntent = await postIntentToTsnMempool(intentRequest);
  const record = await upsertPaymentIntent({
    id: intentRequest.paymentId,
    paymentId: intentRequest.paymentId,
    intentSeedHash: intentRequest.intentSeedHash,
    recipientHash: intentRequest.recipientHash,
    tokenMintAddress: intentRequest.tokenMintAddress,
    amount: intentRequest.amount,
  });

  if (!env.TSN_CREATE_INTENTS_ONCHAIN) {
    logger.info("tsn.intent.mempool_posted", { paymentId: payment.id, intentId: record.id });
    return { enabled: true as const, record, mempoolIntent, onchain: null as null };
  }
  logger.info("tsn.intent.onchain_delegated_to_tsn", { paymentId: payment.id, intentId: record.id });
  return { enabled: true as const, record, mempoolIntent, onchain: null as null };
}

export async function requestPaymentClaimViaTsn(params: {
  authUser: AuthenticatedUser;
  paymentId: string;
  pin: string;
  walletAddress?: string;
  receiverWalletId?: string;
  derivedPaymentReceiverPublicKey?: string;
  privacySpendSignature?: string;
  autoclaim: boolean;
}) {
  if (!env.TSN_ENABLED) throw new Error("TSN is not enabled");

  const payment = await findPaymentById(params.paymentId);
  if (!payment) throw new Error("Payment not found");
  if (!paymentCanStillBeClaimed(payment.status)) throw new Error(`Payment is already ${payment.status}`);
  if (payment.receiver_phone !== params.authUser.phoneNumber) {
    throw new Error("Signed-in account does not match payment receiver");
  }

  await verifyUserActionPin(params.authUser, params.pin);

  const existingUser = await findUserByPhoneNumber(params.authUser.phoneNumber);
  if (!existingUser || existingUser.id !== params.authUser.id) {
    throw new Error("Receiver must register a TrustLink identity before requesting claim");
  }
  if (!existingUser.phone_identity_pubkey || !existingUser.privacy_spend_pubkey) {
    throw new Error("Receiver must register secure privacy keys before requesting claim");
  }

  const requestedSettlementWalletAddress =
    params.receiverWalletId != null
      ? (await findReceiverWalletById(params.receiverWalletId, existingUser.id))?.wallet_address
      : params.walletAddress ?? existingUser.wallet_address ?? undefined;

  const paymentPhoneIdentityPublicKey = payment.phone_identity_pubkey ?? existingUser.phone_identity_pubkey;
  const binding = await getIdentityBindingState(existingUser.phone_identity_pubkey);
  const settlementWalletAddress = binding?.settlementWallet ?? requestedSettlementWalletAddress;
  if (!settlementWalletAddress) throw new Error("Receiver wallet not found");
  if (binding && requestedSettlementWalletAddress && binding.settlementWallet !== requestedSettlementWalletAddress) {
    throw new Error(`This TrustLink identity is already bound to ${binding.settlementWallet}`);
  }

  if (resolveClaimMode(payment) === "secure") {
    if (params.derivedPaymentReceiverPublicKey !== payment.payment_receiver_pubkey) {
      throw new Error("Derived receiver key mismatch detected");
    }
    if (!params.privacySpendSignature) throw new Error("Missing privacy ownership proof");
    const proofValid = verifyClaimProof({
      privacySpendPublicKey: existingUser.privacy_spend_pubkey,
      privacySpendSignature: params.privacySpendSignature,
      paymentId: payment.id,
      phoneIdentityPublicKey: paymentPhoneIdentityPublicKey,
      paymentReceiverPublicKey: payment.payment_receiver_pubkey!,
      ephemeralPublicKey: payment.ephemeral_pubkey!,
      settlementWalletPublicKey: settlementWalletAddress,
    });
    if (!proofValid) throw new Error("Privacy ownership proof is invalid");
  }

  const existingIntent = await findPaymentIntentByPaymentId(payment.id);
  const created = existingIntent ? null : await createTsnIntentForPayment(payment);
  const intent = existingIntent ?? ("record" in (created ?? {}) ? (created as any).record : null);
  if (!intent) throw new Error("TSN intent not available for payment");

  const existingClaim = await findLatestActiveClaimRequestByPaymentId(payment.id);
  if (existingClaim && existingClaim.status !== "failed" && existingClaim.status !== "canceled") {
    return {
      paymentId: payment.id,
      intentId: intent.id,
      claimRequestId: existingClaim.id,
      destinationWallet: existingClaim.destination_wallet ?? settlementWalletAddress,
      autoclaim: existingClaim.autoclaim,
      status: existingClaim.status,
    };
  }

  const claimRequestPayload = buildRequestClaimRequest({
    paymentId: payment.id,
    intentId: intent.id,
    recipientHash: payment.receiver_phone_hash,
    destinationWallet: settlementWalletAddress,
    autoclaim: params.autoclaim,
    source: "trustlink-pay",
  });
  const mempoolClaimRequest = await postClaimRequestToTsnMempool(claimRequestPayload);
  const claimRequest = await createClaimRequest(claimRequestPayload);

  return {
    paymentId: payment.id,
    intentId: intent.id,
    claimRequestId: claimRequest.id,
    mempoolClaimRequest,
    destinationWallet: settlementWalletAddress,
    autoclaim: claimRequest.autoclaim,
    status: claimRequest.status,
  };
}

export async function syncPaymentIntentFromChain(params: { intentId: string }) {
  if (!env.TSN_ENABLED || env.TSN_SYNC_ONCHAIN === false) return null;
  logger.info("tsn.intent.sync_delegated_to_tsn", { intentId: params.intentId });
  return null;
}

function computeStage(intent: PaymentIntentRecord, claimRequest: ClaimRequestRecord | null): TsnUiStage {
  return computeTsnUiStage(intent, claimRequest);
}

export async function enrichPaymentsWithTsnState<T extends PaymentRecord>(payments: T[]): Promise<Array<T & { tsn?: PaymentTsnState }>> {
  if (!env.TSN_ENABLED || payments.length === 0) {
    return payments as Array<T & { tsn?: PaymentTsnState }>;
  }

  const paymentIds = payments.map((payment) => payment.id);
  const [intents, claimRequests] = await Promise.all([
    listPaymentIntentsByPaymentIds(paymentIds),
    listLatestClaimRequestsByPaymentIds(paymentIds),
  ]);

  const intentByPaymentId = new Map<string, PaymentIntentRecord>(intents.map((intent) => [intent.payment_id, intent]));
  const claimByPaymentId = new Map<string, ClaimRequestRecord>(claimRequests.map((claimRequest) => [claimRequest.payment_id, claimRequest]));

  if (env.TSN_SYNC_ONCHAIN) {
    const maybeStale = intents.filter((intent) => intent.status === "pending" || intent.status === "claimed");
    await Promise.allSettled(maybeStale.slice(0, 10).map((intent) => syncPaymentIntentFromChain({ intentId: intent.id })));
    const refreshedIntents = await listPaymentIntentsByPaymentIds(paymentIds);
    intentByPaymentId.clear();
    for (const intent of refreshedIntents) intentByPaymentId.set(intent.payment_id, intent);
  }

  return payments.map((payment) => {
    const intent = intentByPaymentId.get(payment.id);
    if (!intent) return payment as T & { tsn?: PaymentTsnState };

    const claimRequest = claimByPaymentId.get(payment.id) ?? null;
    const tsn: PaymentTsnState = {
      stage: computeStage(intent, claimRequest),
      intentStatus: intent.status,
      claimRequestStatus: claimRequest?.status ?? null,
      destinationWallet: claimRequest?.destination_wallet ?? null,
      assignedCrankerPubkey: intent.assigned_cranker_pubkey,
      claimTxSig: intent.claim_tx_sig ?? null,
      proofTxSig: intent.proof_tx_sig,
    };

    return { ...(payment as any), tsn };
  });
}

export function isTsnSettled(payment: { tsn?: PaymentTsnState }) {
  return payment.tsn?.stage === "cranker_paid" || payment.tsn?.stage === "epoch_settled";
}
