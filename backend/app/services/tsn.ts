import { findPaymentById } from "@/app/db/payments";
import { findReceiverWalletById } from "@/app/db/receiver-wallets";
import { sql } from "@/app/db/client";
import {
  createClaimRequest,
  findLatestActiveClaimRequestByPaymentId,
  findPaymentIntentByPaymentId,
  listLatestClaimRequestsByPaymentIds,
  listPaymentIntentsByPaymentIds,
  updateClaimRequestStatus,
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
import { traceFunction } from "../../../utils/observability/tracer";
import type {
  ClaimRequestRecord,
  ClaimRequestStatus,
  PaymentIntentRecord,
  PaymentIntentStatus,
  TsnMempoolClaimRequest,
  TsnMempoolIntent,
} from "@trustlink/tsn-sdk";
import {
  buildRequestClaimRequest,
  computeTsnUiStage,
  HttpTsnMempool,
  sha256Bytes,
  type RequestClaimRequest,
} from "@trustlink/tsn-sdk";

function paymentCanStillBeClaimed(status: string) {
  return status === "locked" || status === "expired";
}

function intentIsEscrowed(intent: PaymentIntentRecord | null) {
  return intent?.status === "escrowed" || intent?.status === "onchain" || intent?.status === "claimed";
}

function resolveClaimMode(payment: { payment_mode?: string | null }) {
  return payment.payment_mode === "invite" ? "invite" : "secure";
}

function getTsnMempoolClient() {
  return new HttpTsnMempool(
    env.TSN_MEMPOOL_URL,
    env.TSN_MEMPOOL_API_KEY,
  );
}

function withMempoolTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("TSN mempool status request timed out")),
      env.TSN_MEMPOOL_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isTerminalIntentStatus(status: PaymentIntentStatus) {
  return (
    status === "executed" ||
    status === "settled" ||
    status === "expired" ||
    status === "failed" ||
    status === "canceled" ||
    status === "reverted"
  );
}

/** Minimum seconds between TSN status queries for the same transaction. */
const STATUS_REFRESH_COOLDOWN_SECONDS = 2;
/** Maximum seconds to wait before allowing another TSN query for a non-terminal intent. */
const STATUS_REFRESH_MAX_COOLDOWN_SECONDS = 300;
/** After this many seconds since creation, stop querying TSN for non-terminal intents. */
const STATUS_REFRESH_MAX_AGE_SECONDS = 86_400; // 24 hours

const postClaimRequestToTsnMempool = traceFunction(async function postClaimRequestToTsnMempool(request: RequestClaimRequest) {
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
}, {
  namespace: "TSN",
  name: "postClaimRequestToTsnMempool",
  module: "backend/app/services/tsn.ts",
  level: "info",
  includeReturn: false,
});

async function createTsnIntentForPaymentImpl(payment: PaymentRecord) {
  if (!env.TSN_ENABLED) {
    return { enabled: false as const };
  }

  // The backend has only a payment record and recipient hash. It does not have
  // the sender's signed recipient-route commitment, route version, or wallet
  // authorization required by TSN. Never invent those values just to create an
  // intent: the sender must create a new TSN payment from their wallet.
  throw new Error(
    `Payment ${payment.id} predates sender-authorized TSN routing. Ask the sender to create a new TSN payment from their wallet.`,
  );
}

async function requestOnboardedRecipientSettlementViaTsnImpl(params: {
  payment: PaymentRecord;
  receiver: Pick<UserRecord, "id" | "phone_number" | "tin" | "wallet_address">;
}) {
  if (!env.TSN_ENABLED) {
    return { enabled: false as const };
  }

  const payment = params.payment;
  const receiver = params.receiver;
  if (!receiver.tin) {
    throw new Error("Recipient must create a TIN before receiving TSN payments.");
  }
  const settlementWalletAddress = receiver.wallet_address ?? undefined;
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
    throw new Error(
      "This payment has no sender-authorized TSN intent. The sender must create a new TSN payment; the backend cannot create one from recipient data.",
    );
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

async function requestPaymentClaimViaTsnImpl(params: {
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
  const existingIntent = await findPaymentIntentByPaymentId(payment.id);
  if (!paymentCanStillBeClaimed(payment.status) && !intentIsEscrowed(existingIntent)) {
    throw new Error(`Payment is already ${payment.status}`);
  }
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
      : params.walletAddress ?? existingUser.wallet_address ?? undefined;

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

function computeStage(intent: PaymentIntentRecord, claimRequest: ClaimRequestRecord | null): TsnUiStage {
  return computeTsnUiStage(intent, claimRequest);
}

function paymentLooksLikeFrontendTsnAuthorization(payment: PaymentRecord) {
  return payment.escrow_account?.startsWith("tsn:") || payment.escrow_vault_address === payment.sender_wallet;
}

function buildUnpublishedTsnState(): PaymentTsnState {
  return {
    stage: "reverted",
    intentStatus: "failed",
    claimRequestStatus: null,
    destinationWallet: null,
    assignedCrankerPubkey: null,
    escrowTxSig: null,
    claimTxSig: null,
    proofTxSig: null,
    settlementReason: "TSN authorization was signed, but the payment intent was not published to the TSN mempool. No escrow transaction was created.",
  };
}

async function syncPaymentIntentTraceFromMempoolImpl(paymentId: string) {
  const intent = await findPaymentIntentByPaymentId(paymentId);
  if (!intent) return false;

  try {
    const mempool = getTsnMempoolClient();
    const mempoolIntents = await withMempoolTimeout(mempool.listIntents());
    const foundIntent = Array.isArray(mempoolIntents)
      ? mempoolIntents.find((candidate) => candidate.id === intent.id)
      : null;

    if (!foundIntent) return false;

    const normalizedIntentStatus = normalizePaymentIntentStatus(foundIntent.status);
    const hasNewTrace =
      Boolean(foundIntent.escrowTxSig && !intent.escrow_tx_sig) ||
      Boolean(foundIntent.claimTxSig && !intent.claim_tx_sig) ||
      Boolean(foundIntent.proofTxSig && !intent.proof_tx_sig);
    const statusChanged = Boolean(
      normalizedIntentStatus && normalizedIntentStatus !== intent.status,
    );

    if (!hasNewTrace && !statusChanged) return false;

    await updatePaymentIntentStatus({
      id: intent.id,
      status: normalizedIntentStatus ?? intent.status,
      assignedCrankerPubkey: foundIntent.assignedCrankerPubkey ?? null,
      escrowTxSig: foundIntent.escrowTxSig ?? null,
      claimTxSig: foundIntent.claimTxSig ?? null,
      proofTxSig: foundIntent.proofTxSig ?? null,
    });

    return true;
  } catch (error) {
    logger.warn("tsn.intent.trace_sync_failed", {
      paymentId,
      intentId: intent.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return false;
  }
}

/**
 * Compute the cooldown delay (in ms) before the next TSN status query is allowed.
 * Uses exponential backoff: starts at 15s, doubles each check, capped at 5 minutes.
 */
function computeRefreshCooldownMs(checkCount: number): number {
  const base = STATUS_REFRESH_COOLDOWN_SECONDS * 1000;
  const backoff = base * Math.pow(2, Math.min(checkCount, 5));
  return Math.min(backoff, STATUS_REFRESH_MAX_COOLDOWN_SECONDS * 1000);
}

/**
 * Refresh the status of a single payment intent by querying the TSN mempool.
 * - Skips if the intent is already finalized (terminal status).
 * - Skips if the intent was checked within the cooldown window.
 * - Skips if the intent is older than MAX_AGE_SECONDS.
 * - Updates `last_status_checked_at`, `status_finalized_at`, and `status_check_count` in DB.
 */
async function refreshSinglePaymentIntentStatusImpl(paymentId: string): Promise<{
  refreshed: boolean;
  reason?: string;
  previousIntentStatus?: PaymentIntentStatus | null;
  latestIntentStatus?: PaymentIntentStatus | null;
  previousClaimStatus?: ClaimRequestStatus | null;
  latestClaimStatus?: ClaimRequestStatus | null;
  tsnQueried: boolean;
  dbUpdated: boolean;
  finalized: boolean;
  nextRefreshAfterMs: number | null;
}> {
  const payment = await findPaymentById(paymentId);
  if (!payment) {
    return { refreshed: false, reason: "Payment not found", tsnQueried: false, dbUpdated: false, finalized: false, nextRefreshAfterMs: null };
  }

  const intent = await findPaymentIntentByPaymentId(paymentId);
  if (!intent) {
    return { refreshed: false, reason: "No TSN intent found for payment", tsnQueried: false, dbUpdated: false, finalized: false, nextRefreshAfterMs: null };
  }

  const previousIntentStatus = intent.status;
  const previousClaimStatus = (await findLatestActiveClaimRequestByPaymentId(paymentId))?.status ?? null;

  // 1. Finalized check: if already terminal, never query TSN again
  if (isTerminalIntentStatus(intent.status)) {
    return {
      refreshed: false,
      reason: `Intent already finalized with status: ${intent.status}`,
      previousIntentStatus,
      latestIntentStatus: intent.status,
      previousClaimStatus,
      latestClaimStatus: previousClaimStatus,
      tsnQueried: false,
      dbUpdated: false,
      finalized: true,
      nextRefreshAfterMs: null,
    };
  }

  // 2. Age check: if too old, stop querying
  const ageSeconds = (Date.now() - new Date(intent.created_at).getTime()) / 1000;
  if (ageSeconds > STATUS_REFRESH_MAX_AGE_SECONDS) {
    return {
      refreshed: false,
      reason: `Intent exceeds max age of ${STATUS_REFRESH_MAX_AGE_SECONDS}s for status refresh`,
      previousIntentStatus,
      latestIntentStatus: intent.status,
      previousClaimStatus,
      latestClaimStatus: previousClaimStatus,
      tsnQueried: false,
      dbUpdated: false,
      finalized: false,
      nextRefreshAfterMs: null,
    };
  }

  const lastCheckedAt = (intent as any).last_status_checked_at
    ? new Date((intent as any).last_status_checked_at).getTime()
    : 0;
  const checkCount = (intent as any).status_check_count ?? 0;
  const cooldownMs = computeRefreshCooldownMs(checkCount);
  const now = Date.now();

  // 3. Cooldown check
  if (lastCheckedAt > 0 && now - lastCheckedAt < cooldownMs) {
    const remainingMs = cooldownMs - (now - lastCheckedAt);
    return {
      refreshed: false,
      reason: `Within cooldown window (${Math.ceil(remainingMs / 1000)}s remaining)`,
      previousIntentStatus,
      latestIntentStatus: intent.status,
      previousClaimStatus,
      latestClaimStatus: previousClaimStatus,
      tsnQueried: false,
      dbUpdated: false,
      finalized: false,
      nextRefreshAfterMs: remainingMs,
    };
  }

  // 4. Query TSN mempool for this specific intent
  let tsnQueried = false;
  let dbUpdated = false;
  let latestIntentStatus: PaymentIntentStatus = intent.status;
  let latestClaimStatus = previousClaimStatus;

  try {
    const mempool = getTsnMempoolClient();
    const mempoolIntents = await withMempoolTimeout(mempool.listIntents());
    tsnQueried = true;

    const foundIntent = Array.isArray(mempoolIntents) ? mempoolIntents.find(i => i.id === intent.id) : null;

    if (foundIntent) {
      const normalizedIntentStatus = normalizePaymentIntentStatus(foundIntent.status);
      const hasNewTrace =
        Boolean(foundIntent.escrowTxSig && !intent.escrow_tx_sig) ||
        Boolean(foundIntent.claimTxSig && !intent.claim_tx_sig) ||
        Boolean(foundIntent.proofTxSig && !intent.proof_tx_sig);

      if (
        normalizedIntentStatus &&
        (normalizedIntentStatus !== intent.status || hasNewTrace)
      ) {
        await updatePaymentIntentStatus({
          id: intent.id,
          status: normalizedIntentStatus,
          assignedCrankerPubkey: foundIntent.assignedCrankerPubkey ?? null,
          escrowTxSig: foundIntent.escrowTxSig ?? null,
          claimTxSig: foundIntent.claimTxSig ?? null,
          proofTxSig: foundIntent.proofTxSig ?? null,
        });
        latestIntentStatus = normalizedIntentStatus;
        dbUpdated = true;
      }

      // Also sync claim request if present
      if (foundIntent.paymentId) {
        const mempoolClaims = await withMempoolTimeout(mempool.listClaimRequests({ intentId: intent.id }));
        const foundClaim = Array.isArray(mempoolClaims) ? mempoolClaims[0] : null;
        if (foundClaim) {
          const normalizedClaimStatus = normalizeClaimRequestStatus(foundClaim.status);
          if (normalizedClaimStatus) {
            const localClaim = await findLatestActiveClaimRequestByPaymentId(paymentId);
            if (localClaim && normalizedClaimStatus !== localClaim.status) {
              await updateClaimRequestStatus({ id: localClaim.id, status: normalizedClaimStatus });
              latestClaimStatus = normalizedClaimStatus;
              dbUpdated = true;
            }
          }
        }
      }
    }
  } catch (error) {
    logger.warn("tsn.intent.refresh_query_failed", {
      paymentId,
      intentId: intent.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // TSN query failed — don't advance cooldown so the next attempt retries quickly
    return {
      refreshed: false,
      reason: "TSN query failed",
      previousIntentStatus,
      latestIntentStatus: intent.status,
      previousClaimStatus,
      latestClaimStatus: previousClaimStatus,
      tsnQueried: false,
      dbUpdated: false,
      finalized: false,
      nextRefreshAfterMs: 5_000,
    };
  }

  // 5. Update tracking fields (only reached when TSN was queried successfully)
  const isFinalized = isTerminalIntentStatus(latestIntentStatus);
  await sql`
    UPDATE payment_intents
    SET
      last_status_checked_at = NOW(),
      status_check_count = status_check_count + 1,
      status_finalized_at = CASE
        WHEN ${isFinalized} AND status_finalized_at IS NULL THEN NOW()
        ELSE status_finalized_at
      END
    WHERE id = ${intent.id}
  `;

  const nextCooldownMs = computeRefreshCooldownMs(checkCount + 1);

  return {
    refreshed: tsnQueried || dbUpdated,
    previousIntentStatus,
    latestIntentStatus,
    previousClaimStatus,
    latestClaimStatus,
    tsnQueried,
    dbUpdated,
    finalized: isFinalized,
    nextRefreshAfterMs: isFinalized ? null : nextCooldownMs,
  };
}

function normalizePaymentIntentStatus(status: string): PaymentIntentStatus | null {
  if (
    status === "pending" ||
    status === "escrowed" ||
    status === "onchain" ||
    status === "claimed" ||
    status === "executed" ||
    status === "settled" ||
    status === "expired" ||
    status === "failed" ||
    status === "canceled" ||
    status === "reverted"
  ) {
    return status;
  }
  return null;
}

function normalizeClaimRequestStatus(status: string): ClaimRequestStatus | null {
  if (
    status === "pending" ||
    status === "processing" ||
    status === "completed" ||
    status === "canceled" ||
    status === "failed"
  ) {
    return status;
  }
  return null;
}

async function enrichPaymentsWithTsnStateImpl(payments: PaymentRecord[]): Promise<Array<PaymentRecord & { tsn?: PaymentTsnState }>> {
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

  return payments.map((payment) => {
    const intent = intentByPaymentId.get(payment.id);
    if (!intent) {
      if (payment.status === "created" && paymentLooksLikeFrontendTsnAuthorization(payment)) {
        return { ...payment, tsn: buildUnpublishedTsnState() };
      }

      return payment;
    }

    const claimRequest = claimByPaymentId.get(payment.id) ?? null;
    const stage = computeStage(intent, claimRequest);
    const tsn: PaymentTsnState = {
      stage,
      intentStatus: intent.status,
      claimRequestStatus: claimRequest?.status ?? null,
      destinationWallet: claimRequest?.destination_wallet ?? null,
      assignedCrankerPubkey: intent.assigned_cranker_pubkey,
      escrowTxSig: intent.escrow_tx_sig ?? null,
      claimTxSig: intent.claim_tx_sig ?? null,
      proofTxSig: intent.proof_tx_sig,
      settlementReason:
        stage === "reverted" && intent.status === "canceled"
          ? "TSN intent is no longer active in the mempool. No escrow transaction was created."
          : null,
    };

    return { ...payment, tsn };
  });
}

export function isTsnSettled(payment: { tsn?: PaymentTsnState }) {
  return payment.tsn?.stage === "cranker_paid" || payment.tsn?.stage === "epoch_settled";
}

export const syncPaymentIntentTraceFromMempool = traceFunction(syncPaymentIntentTraceFromMempoolImpl, {
  namespace: "TSN",
  name: "syncPaymentIntentTraceFromMempool",
  module: "backend/app/services/tsn.ts",
  level: "debug",
  includeReturn: false,
});

export const createTsnIntentForPayment = traceFunction(createTsnIntentForPaymentImpl, {
  namespace: "TSN",
  name: "createTsnIntentForPayment",
  module: "backend/app/services/tsn.ts",
  level: "info",
  includeReturn: false,
});

export const requestOnboardedRecipientSettlementViaTsn = traceFunction(
  requestOnboardedRecipientSettlementViaTsnImpl,
  {
    namespace: "TSN",
    name: "requestOnboardedRecipientSettlementViaTsn",
    module: "backend/app/services/tsn.ts",
    level: "info",
    includeReturn: false,
  },
);

export const requestPaymentClaimViaTsn = traceFunction(requestPaymentClaimViaTsnImpl, {
  namespace: "TSN",
  name: "requestPaymentClaimViaTsn",
  module: "backend/app/services/tsn.ts",
  level: "info",
  includeReturn: false,
});

export const refreshSinglePaymentIntentStatus = traceFunction(
  refreshSinglePaymentIntentStatusImpl,
  {
    namespace: "TSN",
    name: "refreshSinglePaymentIntentStatus",
    module: "backend/app/services/tsn.ts",
    level: "debug",
    includeReturn: false,
  },
);

export const enrichPaymentsWithTsnState = traceFunction(enrichPaymentsWithTsnStateImpl, {
  namespace: "TSN",
  name: "enrichPaymentsWithTsnState",
  module: "backend/app/services/tsn.ts",
  level: "debug",
  includeReturn: false,
});
