import { apiPost } from "@/src/lib/api";
import type { PaymentRecord } from "@/src/lib/types";
import { submitPaymentAuthorizationToMempool } from "@trustlink/tsn-sdk/payment-authorization";
import { estimateTsnSendCostFromChain as estimateTsnSendCostFromSdk } from "@trustlink/tsn-sdk/send-estimate";
import { traceFunction } from "@trustlink/observability/tracer";

type PaymentTsnState = NonNullable<PaymentRecord["tsn"]>;

function getTsnMempoolUrl() {
  const url = process.env.NEXT_PUBLIC_TSN_MEMPOOL_URL;
  if (!url) throw new Error("NEXT_PUBLIC_TSN_MEMPOOL_URL is missing");
  return url.replace(/\/$/, "");
}

export type TsnMempoolPaymentStatus = {
  intentStatus: PaymentTsnState["intentStatus"];
  claimRequestStatus: PaymentTsnState["claimRequestStatus"];
  assignedCrankerPubkey: string | null;
  escrowTxSig: string | null;
  claimTxSig: string | null;
  proofTxSig: string | null;
  settlementReason: string | null;
};

function deriveTsnStage(status: TsnMempoolPaymentStatus): PaymentTsnState["stage"] {
  if (
    status.intentStatus === "failed" ||
    status.intentStatus === "canceled" ||
    status.intentStatus === "expired" ||
    status.intentStatus === "reverted" ||
    status.claimRequestStatus === "failed" ||
    status.claimRequestStatus === "canceled"
  ) {
    return "reverted";
  }
  if (
    status.intentStatus === "executed" ||
    status.intentStatus === "settled" ||
    status.claimRequestStatus === "completed"
  ) {
    return "cranker_paid";
  }
  if (status.claimRequestStatus === "processing") return "lease_claimed";
  if (status.claimRequestStatus === "pending") return "claim_requested";
  if (
    status.intentStatus === "escrowed" ||
    status.intentStatus === "onchain" ||
    status.intentStatus === "claimed"
  ) {
    return "escrowed";
  }
  return "intent_pending";
}

export async function fetchTsnMempoolPaymentStatus(params: {
  paymentId: string;
  intentId?: string | null;
  signal?: AbortSignal;
}): Promise<TsnMempoolPaymentStatus | null> {
  const baseUrl = getTsnMempoolUrl();
  const [intentsResponse, claimsResponse] = await Promise.all([
    fetch(`${baseUrl}/intents`, { headers: { accept: "application/json" }, signal: params.signal }),
    fetch(`${baseUrl}/claim-requests`, { headers: { accept: "application/json" }, signal: params.signal }),
  ]);
  if (!intentsResponse.ok || !claimsResponse.ok) return null;
  const intents = (await intentsResponse.json()) as Array<Record<string, unknown>>;
  const claims = (await claimsResponse.json()) as Array<Record<string, unknown>>;
  const intent = intents.find((item) =>
    String(item.id ?? "") === String(params.intentId ?? "") ||
    String(item.paymentId ?? "") === params.paymentId,
  );
  if (!intent) return null;
  const claim = claims.find((item) => String(item.intentId ?? "") === String(intent.id ?? ""));
  const status = {
    intentStatus: String(intent.status ?? "pending") as PaymentTsnState["intentStatus"],
    claimRequestStatus: claim ? String(claim.status ?? "pending") as PaymentTsnState["claimRequestStatus"] : null,
    assignedCrankerPubkey: typeof intent.assignedCrankerPubkey === "string" ? intent.assignedCrankerPubkey : null,
    escrowTxSig: typeof intent.escrowTxSig === "string" ? intent.escrowTxSig : null,
    claimTxSig: typeof intent.claimTxSig === "string" ? intent.claimTxSig : null,
    proofTxSig: typeof intent.proofTxSig === "string" ? intent.proofTxSig : null,
    settlementReason: typeof intent.settlementReason === "string" ? intent.settlementReason : null,
  };
  return status;
}

export function toPaymentTsnState(
  status: TsnMempoolPaymentStatus,
  destinationWallet: string | null = null,
): PaymentRecord["tsn"] {
  return {
    stage: deriveTsnStage(status),
    intentStatus: status.intentStatus,
    claimRequestStatus: status.claimRequestStatus,
    destinationWallet,
    assignedCrankerPubkey: status.assignedCrankerPubkey,
    escrowTxSig: status.escrowTxSig,
    claimTxSig: status.claimTxSig,
    proofTxSig: status.proofTxSig,
    settlementReason: status.settlementReason,
  };
}

async function postTerminalLog(
  event: string,
  meta: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info",
) {
  try {
    await fetch("/api/tsn/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, meta, level }),
    });
  } catch {
    // ignore logging failures
  }
}

async function enqueueTsnPaymentFromFrontendImpl(params: {
  paymentId: string;
  recipientHash: string;
  recipientTin: string;
  destinationWallet: string;
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
  pruSpendSelections?: Array<{
    pruIndex: number;
    amountBaseUnits: string;
    nonce: number;
  }> | null;
  privacyVersion?: number | null;
  commitmentRecord?: string | null;
  senderTokenAccount?: string | null;
  settlementVault?: string | null;
  settlementTokenAccount?: string | null;
  settlementPaymentIntentId?: string | null;
  transferId?: string | null;
  commitmentHash?: string | null;
  settlementEpoch?: number | null;
  encryptedSettlementToken?: {
    algorithm: "x25519-xsalsa20-poly1305";
    ciphertextBase64: string;
    nonceBase64: string;
    ephemeralPublicKeyBase64: string;
    commitmentHash: string;
    transferId: string;
    epoch: number;
  } | null;
  autoclaim?: boolean;
  amount: number;
  recipientAmount: number;
}) {
  const { intent, intentRequest, claimRequest } = await submitPaymentAuthorizationToMempool({
    mempoolUrl: getTsnMempoolUrl(),
    paymentId: params.paymentId,
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
    recipientTin: params.recipientTin,
    destinationWallet: params.destinationWallet,
    autoclaim: params.autoclaim ?? true,
    recipientHash: params.recipientHash,
    tokenMintAddress: params.tokenMintAddress,
    amount: params.amount,
    recipientAmount: params.recipientAmount,
    source: "trustlink-pay-frontend",
  });

  const registered = await apiPost<{
    intentId: string;
    claimRequestId?: string | null;
    status?: string;
  }>("/api/tsn/register", {
    paymentId: params.paymentId,
    intentId: intent.id,
    intentSeedHash: intentRequest.intentSeedHash,
    recipientHash: params.recipientHash,
    recipientTin: params.recipientTin,
    destinationWallet: params.destinationWallet,
    tokenMintAddress: params.tokenMintAddress,
    amount: params.amount,
    autoclaim: params.autoclaim ?? true,
  });

  return {
    ...registered,
    claimRequestId: claimRequest?.id ?? registered.claimRequestId ?? null,
  };
}

export const enqueueTsnPaymentFromFrontend = traceFunction(
  enqueueTsnPaymentFromFrontendImpl,
  {
    namespace: "TSN",
    name: "enqueueTsnPaymentFromFrontend",
    module: "frontend/src/lib/tsn.ts",
    level: "info",
    includeReturn: false,
  },
);

function parseUsdPrice(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseConfiguredUsdPrices() {
  const prices: Record<string, number> = {
    USDC: 1,
    USDT: 1,
  };
  const raw = process.env.NEXT_PUBLIC_TSN_USD_PRICES?.trim();

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [symbol, value] of Object.entries(parsed)) {
        const price = typeof value === "number" ? value : Number(value);
        if (Number.isFinite(price) && price > 0) {
          prices[symbol.trim().toUpperCase()] = price;
        }
      }
    } catch {
      for (const entry of raw.split(",")) {
        const [symbol, value] = entry.split("=");
        const price = Number(value);
        if (symbol && Number.isFinite(price) && price > 0) {
          prices[symbol.trim().toUpperCase()] = price;
        }
      }
    }
  }

  const solUsd = parseUsdPrice(process.env.NEXT_PUBLIC_TSN_SOL_USD);
  const usdcUsd = parseUsdPrice(process.env.NEXT_PUBLIC_TSN_USDC_USD);
  const usdtUsd = parseUsdPrice(process.env.NEXT_PUBLIC_TSN_USDT_USD);

  if (solUsd != null) prices.SOL = solUsd;
  if (usdcUsd != null) prices.USDC = usdcUsd;
  if (usdtUsd != null) prices.USDT = usdtUsd;

  return prices;
}

function getConfiguredUsdPrices() {
  const prices = parseConfiguredUsdPrices();

  return {
    solUsd: prices.SOL ?? null,
    usdcUsd: prices.USDC ?? 1,
    usdtUsd: prices.USDT ?? 1,
    bySymbol: prices,
    source: "tsn-config",
  };
}

function tokenUsdBySymbol(
  symbol: string,
  prices: {
    usdcUsd: number | null;
    usdtUsd: number | null;
    bySymbol?: Record<string, number>;
  },
) {
  const normalized = symbol.trim().toUpperCase();
  if (prices.bySymbol?.[normalized] != null) return prices.bySymbol[normalized];
  if (normalized === "USDC") return prices.usdcUsd;
  if (normalized === "USDT") return prices.usdtUsd;
  return null;
}

async function estimateTsnSendCostFromChainImpl(params: {
  senderWallet: string;
  tokenMintAddress: string;
  amountUi: number;
  tokenDecimals?: number;
  tokenSymbol: string;
  tokenUsd?: number | null;
  solUsd?: number | null;
  rpcUrl?: string;
  timeoutMs?: number;
}) {
  const market = getConfiguredUsdPrices();

  const solUsd = params.solUsd ?? market.solUsd;
  const tokenUsd =
    params.tokenUsd ?? tokenUsdBySymbol(params.tokenSymbol, market);
  const estimate = await estimateTsnSendCostFromSdk({
    senderWallet: params.senderWallet,
    amountUi: params.amountUi,
    tokenDecimals: params.tokenDecimals ?? 6,
    tokenSymbol: params.tokenSymbol,
    solUsd,
    tokenUsd,
    rpcUrl: params.rpcUrl,
  });
  await postTerminalLog("tsn.frontend.estimate", estimate.debug);
  return estimate;
}

export const estimateTsnSendCostFromChain = traceFunction(
  estimateTsnSendCostFromChainImpl,
  {
    namespace: "TSN",
    name: "estimateTsnSendCostFromChain",
    module: "frontend/src/lib/tsn.ts",
    level: "debug",
  },
);
