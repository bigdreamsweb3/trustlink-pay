import { findPaymentById } from "@/app/db/payments";
import { findReceiverWalletById } from "@/app/db/receiver-wallets";
import { findPaymentIntentByPaymentId, listPaymentIntentsByPaymentIds, updatePaymentIntentStatus } from "@/app/db/tsn";
import { findUserByPhoneNumber } from "@/app/db/users";
import { env } from "@/app/lib/env";
import { verifyClaimProof } from "@/app/lib/privacy-keys";
import { verifyUserActionPin } from "@/app/services/auth";
import type { AuthenticatedUser } from "@/app/types/auth";
import type { PaymentRecord, PaymentTsnState, UserRecord } from "@/app/types/payment";
import { traceFunction } from "../../../utils/observability/tracer";
import type { PaymentIntentRecord, PaymentIntentStatus } from "@trustlink/tsn-sdk";
import { HttpTsnMempool } from "@trustlink/tsn-sdk";

function mempool() { return new HttpTsnMempool(env.TSN_MEMPOOL_URL, env.TSN_MEMPOOL_API_KEY); }
function timeout<T>(promise: Promise<T>) { return new Promise<T>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("TSN mempool request timed out")), env.TSN_MEMPOOL_TIMEOUT_MS); promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); }); }); }
function terminal(status: PaymentIntentStatus) { return ["executed", "settled", "expired", "failed", "canceled", "reverted"].includes(status); }
function stage(status: PaymentIntentStatus): PaymentTsnState["stage"] { if (status === "settled" || status === "executed") return "epoch_settled"; if (status === "onchain") return "cranker_paid"; if (status === "pending") return "intent_pending"; return "reverted"; }

async function createTsnIntentForPaymentImpl(payment: PaymentRecord) {
  if (!env.TSN_ENABLED) return { enabled: false as const };
  throw new Error(`Payment ${payment.id} predates sender-authorized TSN routing. Ask the sender to create a new TSN payment from their wallet.`);
}

async function requestOnboardedRecipientSettlementViaTsnImpl(params: { payment: PaymentRecord; receiver: Pick<UserRecord, "id" | "phone_number" | "tin" | "wallet_address"> }) {
  if (!env.TSN_ENABLED) return { enabled: false as const };
  if (!params.receiver.tin) throw new Error("Recipient must create a TIN before receiving TSN payments.");
  if (!params.receiver.wallet_address) throw new Error("Recipient TIN does not have a settlement wallet.");
  const intent = await findPaymentIntentByPaymentId(params.payment.id);
  if (!intent) throw new Error("This payment has no sender-authorized TSN intent. The sender must create a new TSN payment.");
  return { enabled: true as const, paymentId: params.payment.id, intentId: intent.id, destinationWallet: params.receiver.wallet_address, status: "internal_pending" as const };
}

async function requestRecipientSettlementViaTsnImpl(params: { authUser: AuthenticatedUser; paymentId: string; pin: string; walletAddress?: string; receiverWalletId?: string; derivedPaymentReceiverPublicKey?: string; privacySpendSignature?: string; autoclaim: boolean }) {
  if (!env.TSN_ENABLED) throw new Error("TSN is not enabled");
  const payment = await findPaymentById(params.paymentId); if (!payment) throw new Error("Payment not found");
  if (payment.receiver_phone !== params.authUser.phoneNumber) throw new Error("Signed-in account does not match payment receiver");
  await verifyUserActionPin(params.authUser, params.pin);
  const user = await findUserByPhoneNumber(params.authUser.phoneNumber); if (!user || user.id !== params.authUser.id) throw new Error("Receiver must register a TrustLink identity before receiving TSN payments");
  if (!user.tin) throw new Error("Receiver must create a TIN before receiving TSN settlement");
  const destinationWallet = params.receiverWalletId != null ? (await findReceiverWalletById(params.receiverWalletId, user.id))?.wallet_address : params.walletAddress ?? user.wallet_address ?? undefined;
  if (!destinationWallet) throw new Error("Receiver wallet not found");
  if (payment.payment_receiver_pubkey) {
    if (!user.privacy_spend_pubkey || !payment.phone_identity_pubkey || !payment.ephemeral_pubkey) throw new Error("Privacy routing data is incomplete");
    if (params.derivedPaymentReceiverPublicKey !== payment.payment_receiver_pubkey || !params.privacySpendSignature) throw new Error("Privacy ownership proof is invalid");
    if (!verifyClaimProof({ privacySpendPublicKey: user.privacy_spend_pubkey, privacySpendSignature: params.privacySpendSignature, paymentId: payment.id, phoneIdentityPublicKey: payment.phone_identity_pubkey, paymentReceiverPublicKey: payment.payment_receiver_pubkey, ephemeralPublicKey: payment.ephemeral_pubkey, settlementWalletPublicKey: destinationWallet })) throw new Error("Privacy ownership proof is invalid");
  }
  const intent = await findPaymentIntentByPaymentId(payment.id); if (!intent) throw new Error("Payment has no sender-authorized TSN intent");
  return { paymentId: payment.id, intentId: intent.id, destinationWallet, autoclaim: params.autoclaim, status: "internal_pending" as const, settlementReference: intent.id };
}

async function syncPaymentIntentTraceFromMempoolImpl(paymentId: string) {
  const intent = await findPaymentIntentByPaymentId(paymentId); if (!intent) return false;
  try { const found = (await timeout(mempool().listIntents())).find((candidate) => candidate.id === intent.id); if (!found) return false; const foundAny = found as typeof found & { fundingTxSig?: string | null; settlementTxSig?: string | null }; const intentAny = intent as typeof intent & { funding_tx_sig?: string | null; settlement_tx_sig?: string | null }; const status = normalizePaymentIntentStatus(found.status); const changed = Boolean(status && (status !== intent.status || foundAny.fundingTxSig !== intentAny.funding_tx_sig || foundAny.settlementTxSig !== intentAny.settlement_tx_sig)); if (!changed) return false; await updatePaymentIntentStatus({ id: intent.id, status: status ?? intent.status, assignedCrankerPubkey: found.assignedCrankerPubkey ?? null, fundingTxSig: foundAny.fundingTxSig ?? null, settlementTxSig: foundAny.settlementTxSig ?? null }); return true; } catch { return false; }
}

async function refreshSinglePaymentIntentStatusImpl(paymentId: string) {
  const intent = await findPaymentIntentByPaymentId(paymentId); if (!intent) return { refreshed: false, reason: "No TSN intent found for payment", tsnQueried: false, dbUpdated: false, finalized: false, nextRefreshAfterMs: null };
  if (terminal(intent.status)) return { refreshed: false, reason: `Intent already finalized with status: ${intent.status}`, previousIntentStatus: intent.status, latestIntentStatus: intent.status, tsnQueried: false, dbUpdated: false, finalized: true, nextRefreshAfterMs: null };
  const refreshed = await syncPaymentIntentTraceFromMempoolImpl(paymentId); const latest = await findPaymentIntentByPaymentId(paymentId);
  return { refreshed, previousIntentStatus: intent.status, latestIntentStatus: latest?.status ?? intent.status, tsnQueried: refreshed, dbUpdated: refreshed, finalized: latest ? terminal(latest.status) : false, nextRefreshAfterMs: refreshed ? 30_000 : 5_000 };
}

function normalizePaymentIntentStatus(status: string): PaymentIntentStatus | null { return ["pending", "onchain", "executed", "settled", "expired", "failed", "canceled", "reverted"].includes(status) ? status as PaymentIntentStatus : null; }

async function enrichPaymentsWithTsnStateImpl(payments: PaymentRecord[]): Promise<Array<PaymentRecord & { tsn?: PaymentTsnState }>> {
  if (!env.TSN_ENABLED || payments.length === 0) return payments as Array<PaymentRecord & { tsn?: PaymentTsnState }>;
  const intents = await listPaymentIntentsByPaymentIds(payments.map((payment) => payment.id));
  const byPayment = new Map<string, PaymentIntentRecord>(intents.map((intent) => [intent.payment_id, intent]));
  return payments.map((payment) => { const intent = byPayment.get(payment.id); if (!intent) return payment; const intentAny = intent as typeof intent & { funding_tx_sig?: string | null; settlement_tx_sig?: string | null }; const tsn: PaymentTsnState = { stage: stage(intent.status), intentStatus: intent.status, destinationWallet: payment.receiver_wallet ?? null, assignedCrankerPubkey: intent.assigned_cranker_pubkey, fundingTxSig: intentAny.funding_tx_sig ?? null, settlementTxSig: intentAny.settlement_tx_sig ?? null, settlementReason: null }; return { ...payment, tsn }; });
}

export function isTsnSettled(payment: { tsn?: PaymentTsnState }) { return payment.tsn?.stage === "cranker_paid" || payment.tsn?.stage === "epoch_settled"; }
export const syncPaymentIntentTraceFromMempool = traceFunction(syncPaymentIntentTraceFromMempoolImpl, { namespace: "TSN", name: "syncPaymentIntentTraceFromMempool", module: "backend/app/services/tsn.ts", level: "debug", includeReturn: false });
export const createTsnIntentForPayment = traceFunction(createTsnIntentForPaymentImpl, { namespace: "TSN", name: "createTsnIntentForPayment", module: "backend/app/services/tsn.ts", level: "info", includeReturn: false });
export const requestOnboardedRecipientSettlementViaTsn = traceFunction(requestOnboardedRecipientSettlementViaTsnImpl, { namespace: "TSN", name: "requestOnboardedRecipientSettlementViaTsn", module: "backend/app/services/tsn.ts", level: "info", includeReturn: false });
export const requestRecipientSettlementViaTsn = traceFunction(requestRecipientSettlementViaTsnImpl, { namespace: "TSN", name: "requestRecipientSettlementViaTsn", module: "backend/app/services/tsn.ts", level: "info", includeReturn: false });
export const refreshSinglePaymentIntentStatus = traceFunction(refreshSinglePaymentIntentStatusImpl, { namespace: "TSN", name: "refreshSinglePaymentIntentStatus", module: "backend/app/services/tsn.ts", level: "debug", includeReturn: false });
export const enrichPaymentsWithTsnState = traceFunction(enrichPaymentsWithTsnStateImpl, { namespace: "TSN", name: "enrichPaymentsWithTsnState", module: "backend/app/services/tsn.ts", level: "debug", includeReturn: false });
