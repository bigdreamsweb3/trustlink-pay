import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

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
import type { PaymentRecord, PaymentTsnState, TsnUiStage, UserRecord } from "@/app/types/payment";
import type { ClaimRequestRecord, PaymentIntentRecord, PaymentIntentStatus } from "@trustlink/tsn-sdk";
import {
  buildCreateIntentRequest,
  buildRequestClaimRequest,
  computeTsnUiStage,
  HttpTsnMempool,
  prepareTsnPaymentMempoolJobRequests,
  sha256Bytes,
  type CreateIntentRequest,
  type RequestClaimRequest,
} from "@trustlink/tsn-sdk";

function paymentCanStillBeClaimed(status: string) {
  return status === "locked" || status === "expired";
}

function resolveClaimMode(payment: { payment_mode?: string | null }) {
  return payment.payment_mode === "invite" ? "invite" : "secure";
}

function getTsnMempoolClient() {
  return new HttpTsnMempool(env.TSN_MEMPOOL_URL);
}

function resolveUnderlyingPaymentPublicKey(payment: PaymentRecord) {
  const candidate = payment.escrow_vault_address ?? payment.sender_wallet;
  if (!candidate) throw new Error("Missing sender or escrow public key for TSN intent");

  try {
    return new PublicKey(candidate).toBase58();
  } catch {
    throw new Error("TSN intent requires a real Solana public key for underlying payment");
  }
}

async function postIntentToTsnMempool(request: CreateIntentRequest) {
  try {
    return await getTsnMempoolClient().postIntent(request);
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
    return await getTsnMempoolClient().postClaimRequest(request);
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
  const recipientAmount = Number(payment.amount);
  const senderFeeAmount = Number(payment.sender_fee_amount ?? 0);
  const totalIntentAmount = recipientAmount + (Number.isFinite(senderFeeAmount) && senderFeeAmount > 0 ? senderFeeAmount : 0);

  const intentRequest = {
    ...buildCreateIntentRequest({
      paymentId: payment.id,
      underlyingPayment: resolveUnderlyingPaymentPublicKey(payment),
      recipientHash: payment.receiver_phone_hash,
      tokenMintAddress: tokenMint,
      amount: totalIntentAmount,
      source: "trustlink-pay",
    }),
    recipientAmount,
  } as CreateIntentRequest & { recipientAmount: number };

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

export async function requestOnboardedRecipientSettlementViaTsn(params: {
  payment: PaymentRecord;
  receiver: Pick<UserRecord, "id" | "phone_number" | "tin" | "tins_wallet_pubkey" | "wallet_address">;
}) {
  if (!env.TSN_ENABLED) {
    return { enabled: false as const };
  }

  const payment = params.payment;
  const receiver = params.receiver;
  if (!receiver.tin) {
    throw new Error("Recipient must create a TIN before receiving TSN payments.");
  }
  const settlementWalletAddress = receiver.tins_wallet_pubkey ?? receiver.wallet_address ?? undefined;
  if (!settlementWalletAddress) {
    throw new Error("Recipient TIN does not have a settlement wallet.");
  }

  let intent = await findPaymentIntentByPaymentId(payment.id);

  const existingClaim = await findLatestActiveClaimRequestByPaymentId(payment.id);
  if (existingClaim && existingClaim.status !== "failed" && existingClaim.status !== "canceled") {
    if (!intent) throw new Error("TSN intent not available for onboarded recipient settlement");
    logger.info("tsn.settlement_request.already_exists", {
      paymentId: payment.id,
      intentId: intent.id,
      claimRequestId: existingClaim.id,
      receiverUserId: receiver.id,
    });
    return {
      enabled: true as const,
      paymentId: payment.id,
      intentId: intent.id,
      claimRequestId: existingClaim.id,
      destinationWallet: existingClaim.destination_wallet ?? settlementWalletAddress,
      status: existingClaim.status,
    };
  }

  if (!intent) {
    const tokenMint = payment.token_mint_address;
    if (!tokenMint) throw new Error("Missing token mint for TSN settlement");
    const allowed = getAllowedTokenByMint(tokenMint);
    if (!allowed) throw new Error("Token mint not allowlisted for TSN settlement");
    const recipientAmount = Number(payment.amount);
    const senderFeeAmount = Number(payment.sender_fee_amount ?? 0);
    const totalIntentAmount = recipientAmount + (Number.isFinite(senderFeeAmount) && senderFeeAmount > 0 ? senderFeeAmount : 0);
    const jobs = prepareTsnPaymentMempoolJobRequests({
      paymentId: payment.id,
      underlyingPayment: resolveUnderlyingPaymentPublicKey(payment),
      recipientHash: payment.receiver_phone_hash,
      tokenMintAddress: tokenMint,
      amount: totalIntentAmount,
      recipientAmount,
      destinationWallet: settlementWalletAddress,
      source: "trustlink-pay",
    });
    intent = await upsertPaymentIntent({
      id: jobs.intentRequest.paymentId,
      paymentId: jobs.intentRequest.paymentId,
      intentSeedHash: jobs.intentRequest.intentSeedHash,
      recipientHash: jobs.intentRequest.recipientHash,
      tokenMintAddress: jobs.intentRequest.tokenMintAddress,
      amount: jobs.intentRequest.amount,
    });
    const claimRequest = await createClaimRequest(jobs.claimRequestPayload);
    const mempool = getTsnMempoolClient();
    const mempoolIntent = await mempool.postIntent(jobs.intentRequest);
    const mempoolClaimRequest = await mempool.postClaimRequest({
      ...jobs.claimRequestPayload,
      intentId: mempoolIntent.id,
    });

    logger.info("tsn.settlement_request.posted", {
      paymentId: payment.id,
      intentId: intent.id,
      claimRequestId: claimRequest.id,
      receiverUserId: receiver.id,
    });

    return {
      enabled: true as const,
      paymentId: payment.id,
      intentId: intent.id,
      claimRequestId: claimRequest.id,
      mempoolIntent,
      mempoolClaimRequest,
      destinationWallet: settlementWalletAddress,
      status: claimRequest.status,
    };
  }

  const claimRequestPayload = buildRequestClaimRequest({
    paymentId: payment.id,
    intentId: intent.id,
    recipientHash: payment.receiver_phone_hash,
    destinationWallet: settlementWalletAddress,
    // Legacy schema field only: onboarded recipients do not manually claim.
    autoclaim: false,
    source: "trustlink-pay",
  });
  const mempoolClaimRequest = await postClaimRequestToTsnMempool(claimRequestPayload);
  const claimRequest = await createClaimRequest(claimRequestPayload);

  logger.info("tsn.settlement_request.posted", {
    paymentId: payment.id,
    intentId: intent.id,
    claimRequestId: claimRequest.id,
    receiverUserId: receiver.id,
  });

  return {
    enabled: true as const,
    paymentId: payment.id,
    intentId: intent.id,
    claimRequestId: claimRequest.id,
    mempoolClaimRequest,
    destinationWallet: settlementWalletAddress,
    status: claimRequest.status,
  };
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
  if (!existingUser.tin) {
    throw new Error("Receiver must create a TIN before requesting TSN settlement");
  }

  const requestedSettlementWalletAddress =
    params.receiverWalletId != null
      ? (await findReceiverWalletById(params.receiverWalletId, existingUser.id))?.wallet_address
      : params.walletAddress ?? existingUser.tins_wallet_pubkey ?? existingUser.wallet_address ?? undefined;

  const paymentPhoneIdentityPublicKey = payment.phone_identity_pubkey ?? existingUser.phone_identity_pubkey;
  const settlementWalletAddress = requestedSettlementWalletAddress;
  if (!settlementWalletAddress) throw new Error("Receiver wallet not found");

  if (resolveClaimMode(payment) === "secure" && payment.payment_receiver_pubkey) {
    if (!existingUser.privacy_spend_pubkey) {
      throw new Error("Receiver must register secure privacy spend keys before requesting this legacy secure claim");
    }
    if (!paymentPhoneIdentityPublicKey || !payment.ephemeral_pubkey) {
      throw new Error("Legacy secure claim is missing privacy routing data");
    }
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

export async function enrichPaymentsWithTsnState(payments: PaymentRecord[]): Promise<Array<PaymentRecord & { tsn?: PaymentTsnState }>> {
  if (!env.TSN_ENABLED || payments.length === 0) {
    return payments as Array<PaymentRecord & { tsn?: PaymentTsnState }>;
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

  const intentList = Array.from(intentByPaymentId.values());
  const signatureStatusMap = await fetchDevnetSignatureStatuses(
    intentList.flatMap((intent) => [intent.claim_tx_sig, intent.proof_tx_sig]).filter(
      (signature): signature is string => Boolean(signature),
    ),
  );

  return payments.map((payment) => {
    const intent = intentByPaymentId.get(payment.id);
    if (!intent) return payment;

    const claimRequest = claimByPaymentId.get(payment.id) ?? null;
    const computedStage = computeStage(intent, claimRequest);
    const claimConfirmed = isSignatureConfirmed(signatureStatusMap, intent.claim_tx_sig);
    const proofConfirmed = isSignatureConfirmed(signatureStatusMap, intent.proof_tx_sig);
    const finalStageRequested = computedStage === "cranker_paid" || computedStage === "epoch_settled";
    const finalStageVerified = !finalStageRequested || (claimConfirmed && proofConfirmed);
    const stage: TsnUiStage = finalStageVerified ? computedStage : "lease_claimed";
    const tsn: PaymentTsnState = {
      stage,
      intentStatus: intent.status,
      claimRequestStatus: claimRequest?.status ?? null,
      destinationWallet: claimRequest?.destination_wallet ?? null,
      assignedCrankerPubkey: intent.assigned_cranker_pubkey,
      claimTxSig: intent.claim_tx_sig ?? null,
      proofTxSig: intent.proof_tx_sig,
      settlementReason:
        !finalStageVerified && finalStageRequested
          ? "Awaiting Devnet confirmation for TSN claim/proof signatures."
          : null,
    };

    return { ...payment, tsn };
  });
}

const devnetConnection = new Connection(clusterApiUrl("devnet"), "confirmed");

async function fetchDevnetSignatureStatuses(signatures: string[]) {
  if (signatures.length === 0) return new Map<string, boolean>();
  const map = new Map<string, boolean>();
  const chunkSize = 128;

  for (let index = 0; index < signatures.length; index += chunkSize) {
    const chunk = signatures.slice(index, index + chunkSize);
    try {
      const statuses = await devnetConnection.getSignatureStatuses(chunk, {
        searchTransactionHistory: true,
      });
      for (let statusIndex = 0; statusIndex < chunk.length; statusIndex += 1) {
        const signature = chunk[statusIndex];
        const status = statuses.value[statusIndex];
        const confirmed = Boolean(status?.confirmationStatus && status.confirmationStatus !== "processed");
        map.set(signature, confirmed);
      }
    } catch {
      for (const signature of chunk) map.set(signature, false);
    }
  }

  return map;
}

function isSignatureConfirmed(statusMap: Map<string, boolean>, signature?: string | null) {
  if (!signature) return false;
  return statusMap.get(signature) === true;
}

export function isTsnSettled(payment: { tsn?: PaymentTsnState }) {
  return payment.tsn?.stage === "cranker_paid" || payment.tsn?.stage === "epoch_settled";
}
