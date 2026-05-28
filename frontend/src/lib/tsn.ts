import { apiPost } from "@/src/lib/api";
import { quoteTransferFeeUiAmount } from "@trustlink/tsn-sdk/quote";
import { getVerifiedTsnProgramId } from "@trustlink/tsn-sdk/program";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";

type TsnIntentRequest = {
  paymentId: string;
  underlyingPayment: string;
  intentSeedHash: string;
  recipientHash: string;
  tokenMintAddress: string;
  amount: number;
  recipientAmount: number;
  source: string;
};

async function sha256Hex(input: string) {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function getTsnMempoolUrl() {
  const url = process.env.NEXT_PUBLIC_TSN_MEMPOOL_URL;
  if (!url) throw new Error("NEXT_PUBLIC_TSN_MEMPOOL_URL is missing");
  return url.replace(/\/$/, "");
}

async function postJson<TResponse>(
  path: string,
  body: unknown,
): Promise<TResponse> {
  const response = await fetch(`${getTsnMempoolUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`TSN mempool request failed (${response.status})`);
  }

  return (await response.json()) as TResponse;
}

async function postTerminalLog(
  event: string,
  meta: Record<string, unknown>,
  level: "warn" | "error" = "warn",
) {
  try {
    await apiPost("/api/tsn/log", { event, meta, level });
  } catch {
    // ignore logging failures
  }
}

export async function enqueueTsnPaymentFromFrontend(params: {
  paymentId: string;
  recipientHash: string;
  destinationWallet: string;
  tokenMintAddress: string;
  senderWallet: string;
  amount: number;
  recipientAmount: number;
}) {
  const intentSeedHash = await sha256Hex(params.paymentId);

  const intentRequest: TsnIntentRequest = {
    paymentId: params.paymentId,
    underlyingPayment: params.senderWallet,
    intentSeedHash,
    recipientHash: params.recipientHash,
    tokenMintAddress: params.tokenMintAddress,
    amount: params.amount,
    recipientAmount: params.recipientAmount,
    source: "trustlink-pay-frontend",
  };

  const intent = await postJson<{ id: string }>("/intents", intentRequest);

  const registered = await apiPost<{
    intentId: string;
    claimRequestId?: string | null;
    status?: string;
  }>("/api/tsn/register", {
    paymentId: params.paymentId,
    intentId: intent.id,
    intentSeedHash,
    recipientHash: params.recipientHash,
    destinationWallet: params.destinationWallet,
    tokenMintAddress: params.tokenMintAddress,
    amount: params.amount,
    autoclaim: true,
  });

  return {
    ...registered,
    claimRequestId: registered.claimRequestId ?? null,
  };
}

function accountDiscriminator(name: string) {
  const payload = new TextEncoder().encode(`account:${name}`);
  return crypto.subtle
    .digest("SHA-256", payload)
    .then((digest) => new Uint8Array(digest).slice(0, 8));
}

async function fetchEscrowConfigFromChain(
  connection: Connection,
  programId: PublicKey,
) {
  const [motherEscrowPda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("tsn_mother_escrow")],
    programId,
  );
  const account = await connection.getAccountInfo(motherEscrowPda, "confirmed");
  if (!account?.data) {
    throw new Error(
      "TSN mother escrow not found on-chain. Run init-mother for this TSN program.",
    );
  }

  const data = new Uint8Array(account.data);
  const discriminator = await accountDiscriminator("MotherEscrow");
  const actual = data.slice(0, 8);
  for (let index = 0; index < 8; index += 1) {
    if (actual[index] !== discriminator[index]) {
      throw new Error("TSN mother escrow discriminator mismatch");
    }
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // MotherEscrow layout:
  // 8 discr + 32 authority + 32 tins_program_id + 32 protocol_seed + 8 epoch_seconds + 8 lease_seconds
  // + 2 fee_split_cranker_bps + 2 fee_split_lp_bps + 2 fee_split_treasury_bps + ...
  let offset = 8 + 32 + 32 + 32 + 8 + 8;
  const feeSplitCrankerBps = view.getUint16(offset, true);
  offset += 2;
  const _feeSplitLpBps = view.getUint16(offset, true);
  offset += 2;
  const _feeSplitTreasuryBps = view.getUint16(offset, true);

  return {
    // TSN fee policy from current architecture:
    // sender fee is modeled as cranker split on covered network cost
    sendFeeBps: Math.max(0, feeSplitCrankerBps),
    feeCoverageTxCount: 4,
    sendFeeMaxUiAmount: 1,
    sendFeeMaxUsd: 1,
  };
}

async function estimateNetworkFeeLamports(
  connection: Connection,
  senderWallet: string,
) {
  const sender = new PublicKey(senderWallet);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: sender,
    blockhash,
    lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: sender,
      lamports: 0,
    }),
  );
  const fee = await connection.getFeeForMessage(
    transaction.compileMessage(),
    "confirmed",
  );
  return fee.value ?? 0;
}

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

export async function estimateTsnSendCostFromChain(params: {
  senderWallet: string;
  tokenMintAddress: string;
  amountUi: number;
  tokenDecimals?: number;
  tokenSymbol: string;
  tokenUsd?: number | null;
  solUsd?: number | null;
  rpcUrl?: string;
}) {
  const connection = new Connection(
    params.rpcUrl ?? clusterApiUrl("devnet"),
    "confirmed",
  );
  const programId = new PublicKey(getVerifiedTsnProgramId());
  const [config, estimatedNetworkFeeLamports, market] = await Promise.all([
    fetchEscrowConfigFromChain(connection, programId),
    estimateNetworkFeeLamports(connection, params.senderWallet),
    Promise.resolve(getConfiguredUsdPrices()),
  ]);

  const solUsd = params.solUsd ?? market.solUsd;
  const tokenUsd =
    params.tokenUsd ?? tokenUsdBySymbol(params.tokenSymbol, market);
  const tokenDecimals = params.tokenDecimals ?? 6;
  if (!solUsd || !tokenUsd) {
    throw new Error("Sender fee not fetched: missing price feed");
  }

  const senderFeeAmountUi = quoteTransferFeeUiAmount({
    estimatedNetworkFeeLamports,
    solUsd,
    tokenUsd: tokenUsd && Number.isFinite(tokenUsd) ? tokenUsd : null,
    tokenDecimals,
    coverageTxCount: config.feeCoverageTxCount,
    feeBps: config.sendFeeBps,
    maxMarginUsd: config.sendFeeMaxUsd,
    maxUiAmount: config.sendFeeMaxUiAmount,
  });

  const networkFeeSol = estimatedNetworkFeeLamports / 1_000_000_000;
  const networkFeeUsd = networkFeeSol * solUsd;
  const senderFeeAmountUsd = tokenUsd ? senderFeeAmountUi * tokenUsd : null;

  const estimate = {
    tokenSymbol: params.tokenSymbol,
    senderFeeAmountUi,
    senderFeeAmountUsd,
    totalTokenRequiredUi: Number(
      (params.amountUi + senderFeeAmountUi).toFixed(6),
    ),
    networkFeeSol,
    networkFeeUsd,
    debug: {
      programId: programId.toBase58(),
      sendFeeBps: config.sendFeeBps,
      feeCoverageTxCount: config.feeCoverageTxCount,
      estimatedNetworkFeeLamports,
      solUsd,
      tokenUsd,
      priceSource: market.source,
    },
  };
  await postTerminalLog("tsn.frontend.estimate", estimate.debug, "warn");
  return estimate;
}
