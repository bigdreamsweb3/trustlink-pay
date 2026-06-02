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

async function accountDiscriminator(name: string) {
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

  return {
    sendFeeBps: Math.max(0, feeSplitCrankerBps),
    feeCoverageTxCount: DEFAULT_TSN_FEE_CONFIG.feeCoverageTxCount,
    sendFeeMaxUiAmount: DEFAULT_TSN_FEE_CONFIG.sendFeeMaxUiAmount,
    sendFeeMaxUsd: DEFAULT_TSN_FEE_CONFIG.sendFeeMaxUsd,
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

export async function estimateTsnSendCostFromChain(params: {
  senderWallet: string;
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
  const [config, estimatedNetworkFeeLamports] = await Promise.all([
    fetchEscrowConfigFromChain(connection, programId),
    estimateNetworkFeeLamports(connection, params.senderWallet),
  ]);

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
