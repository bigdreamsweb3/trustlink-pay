import { apiPost } from "@/src/lib/api";
import { submitPaymentAuthorizationToMempool } from "@trustlink/tsn-sdk/payment-authorization";
import { estimateTsnSendCostFromChain as estimateTsnSendCostFromSdk } from "@trustlink/tsn-sdk/send-estimate";
import { traceFunction } from "../../../utils/observability/tracer";

function getTsnMempoolUrl() {
  const url = process.env.NEXT_PUBLIC_TSN_MEMPOOL_URL;
  if (!url) throw new Error("NEXT_PUBLIC_TSN_MEMPOOL_URL is missing");
  return url.replace(/\/$/, "");
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
  settlementEscrowSecretKeyBase64?: string | null;
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
    settlementEscrowSecretKeyBase64: params.settlementEscrowSecretKeyBase64,
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
