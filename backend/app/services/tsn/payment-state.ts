import type { PaymentRecord, PaymentTsnState, TsnUiStage } from "@/app/types/payment";
import type { ClaimRequestRecord, PaymentIntentRecord } from "@/app/types/tsn";

import { listLatestClaimRequestsByPaymentIds, listPaymentIntentsByPaymentIds } from "@/app/db/tsn";
import { env } from "@/app/lib/env";
import { syncPaymentIntentFromChain } from "@/app/services/tsn/onchain-sync";

function computeStage(intent: PaymentIntentRecord, claimRequest: ClaimRequestRecord | null): TsnUiStage {
  if (intent.status === "settled") return "epoch_settled";
  if (intent.status === "executed") return "cranker_paid";
  if (intent.status === "claimed") return "lease_claimed";

  if (claimRequest && (claimRequest.status === "pending" || claimRequest.status === "processing")) {
    return "claim_requested";
  }

  return "intent_pending";
}

export async function enrichPaymentsWithTsnState<T extends PaymentRecord>(payments: T[]): Promise<Array<T & { tsn?: PaymentTsnState }>> {
  if (!env.TSN_ENABLED || payments.length === 0) {
    return payments as Array<T & { tsn?: PaymentTsnState }>;
  }

  const paymentIds = payments.map((p) => p.id);
  const [intents, claimRequests] = await Promise.all([
    listPaymentIntentsByPaymentIds(paymentIds),
    listLatestClaimRequestsByPaymentIds(paymentIds),
  ]);

  const intentByPaymentId = new Map<string, PaymentIntentRecord>(intents.map((i) => [i.payment_id, i]));
  const claimByPaymentId = new Map<string, ClaimRequestRecord>(claimRequests.map((c) => [c.payment_id, c]));

  // Best-effort real-time sync: if an intent is still pending but might have progressed on-chain,
  // refresh it before returning to the UI.
  if (env.TSN_SYNC_ONCHAIN) {
    const maybeStale = intents.filter((intent) => intent.status === "pending" || intent.status === "claimed");
    await Promise.allSettled(maybeStale.slice(0, 10).map((intent) => syncPaymentIntentFromChain({ intentId: intent.id })));

    // Re-read updated intents for the same payment ids (cheap) to reflect latest status.
    const refreshedIntents = await listPaymentIntentsByPaymentIds(paymentIds);
    intentByPaymentId.clear();
    for (const intent of refreshedIntents) {
      intentByPaymentId.set(intent.payment_id, intent);
    }
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
      claimTxSig: (intent as any).claim_tx_sig ?? null,
      proofTxSig: intent.proof_tx_sig,
    };

    return { ...(payment as any), tsn };
  });
}

export function isTsnSettled(payment: { tsn?: PaymentTsnState }) {
  return payment.tsn?.stage === "cranker_paid" || payment.tsn?.stage === "epoch_settled";
}
