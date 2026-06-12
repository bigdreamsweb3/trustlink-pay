import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";

import { getVerifiedTsnProgramId } from "./program.js";
import { quoteTransferFeeUiAmount } from "./quote.js";

const DEFAULT_TSN_FEE_CONFIG = {
  sendFeeBps: 500,
  feeCoverageTxCount: 4,
  sendFeeMaxUiAmount: 1,
  sendFeeMaxUsd: 1,
};
const DEFAULT_RPC_TIMEOUT_MS = 6_000;
const DEFAULT_NETWORK_FEE_LAMPORTS = 5_000;
const FEE_CONFIG_CACHE_MS = 60_000;

let feeConfigCache:
  | {
      key: string;
      expiresAt: number;
      value: typeof DEFAULT_TSN_FEE_CONFIG;
    }
  | undefined;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
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

async function accountDiscriminator(name: string) {
  const payload = new TextEncoder().encode(`account:${name}`);
  return crypto.subtle
    .digest("SHA-256", payload)
    .then((digest) => new Uint8Array(digest).slice(0, 8));
}

async function fetchEscrowConfigFromChain(
  connection: Connection,
  programId: PublicKey,
  timeoutMs: number,
) {
  const cacheKey = `${connection.rpcEndpoint}:${programId.toBase58()}`;
  if (
    feeConfigCache?.key === cacheKey &&
    feeConfigCache.expiresAt > Date.now()
  ) {
    return feeConfigCache.value;
  }
  const [motherEscrowPda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("tsn_mother_escrow")],
    programId,
  );
  const account = await withTimeout(
    connection.getAccountInfo(motherEscrowPda, "confirmed"),
    timeoutMs,
    "TSN fee configuration request timed out. Retry the quote.",
  );
  if (!account?.data) {
    throw new Error(
      "TSN mother escrow not found on-chain. Run init-mother for this TSN program.",
    );
  }

  const data = new Uint8Array(account.data);
  const minimumMotherEscrowLength =
    8 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 2 + 8 + 8 + 1;
  const discriminator = await accountDiscriminator("MotherEscrow");
  const actual = data.slice(0, 8);
  for (let index = 0; index < 8; index += 1) {
    if (actual[index] !== discriminator[index]) {
      throw new Error("TSN mother escrow discriminator mismatch");
    }
  }
  if (data.byteLength < minimumMotherEscrowLength) {
    return DEFAULT_TSN_FEE_CONFIG;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8 + 32 + 32 + 32 + 8 + 8;
  const feeSplitCrankerBps = view.getUint16(offset, true);

  const value = {
    sendFeeBps: Math.max(0, feeSplitCrankerBps),
    feeCoverageTxCount: DEFAULT_TSN_FEE_CONFIG.feeCoverageTxCount,
    sendFeeMaxUiAmount: DEFAULT_TSN_FEE_CONFIG.sendFeeMaxUiAmount,
    sendFeeMaxUsd: DEFAULT_TSN_FEE_CONFIG.sendFeeMaxUsd,
  };
  feeConfigCache = {
    key: cacheKey,
    expiresAt: Date.now() + FEE_CONFIG_CACHE_MS,
    value,
  };
  return value;
}

async function estimateNetworkFeeLamports(
  connection: Connection,
  senderWallet: string,
  timeoutMs: number,
) {
  const sender = new PublicKey(senderWallet);
  const { blockhash, lastValidBlockHeight } = await withTimeout(
    connection.getLatestBlockhash("confirmed"),
    timeoutMs,
    "Solana network-fe request timed out",
  );
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
  const fee = await withTimeout(
    connection.getFeeForMessage(transaction.compileMessage(), "confirmed"),
    timeoutMs,
    "Solana network-fe request timed out",
  );
  return fee.value ?? DEFAULT_NETWORK_FEE_LAMPORTS;
}

export async function estimateTsnSendCostFromChain(params: {
  senderWallet: string;
  amountUi: number;
  tokenDecimals?: number;
  tokenSymbol: string;
  tokenUsd?: number | null;
  solUsd?: number | null;
  rpcUrl?: string;
  timeoutMs?: number;
}) {
  const connection = new Connection(
    params.rpcUrl ?? clusterApiUrl("devnet"),
    "confirmed",
  );
  const programId = new PublicKey(getVerifiedTsnProgramId());
  const timeoutMs = params.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
  const [config, networkFeeResult] = await Promise.all([
    fetchEscrowConfigFromChain(connection, programId, timeoutMs),
    estimateNetworkFeeLamports(
      connection,
      params.senderWallet,
      timeoutMs,
    ).catch(() => DEFAULT_NETWORK_FEE_LAMPORTS),
  ]);
  const estimatedNetworkFeeLamports = networkFeeResult;

  const tokenDecimals = params.tokenDecimals ?? 6;
  if (!params.solUsd || !params.tokenUsd) {
    throw new Error("Sender fee not fetched: missing price feed");
  }

  const senderFeeAmountUi = quoteTransferFeeUiAmount({
    estimatedNetworkFeeLamports,
    solUsd: params.solUsd,
    tokenUsd: params.tokenUsd,
    tokenDecimals,
    coverageTxCount: config.feeCoverageTxCount,
    feeBps: config.sendFeeBps,
    maxMarginUsd: config.sendFeeMaxUsd,
    maxUiAmount: config.sendFeeMaxUiAmount,
  });

  const networkFeeSol = estimatedNetworkFeeLamports / 1_000_000_000;
  const networkFeeUsd = networkFeeSol * params.solUsd;
  const senderFeeAmountUsd = senderFeeAmountUi * params.tokenUsd;

  return {
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
      solUsd: params.solUsd,
      tokenUsd: params.tokenUsd,
      priceSource: "tsn-config",
    },
  };
}
