import {
  HttpTsnMempool,
  JsonFileTsnMempool,
} from "../../tsn-sdk/src/mempool.ts";
import {
  evaluateSettlementEconomics,
} from "../../tsn-sdk/src/settlement-economics.ts";
import {
  getTsnCrankerPda,
  getTsnMotherEscrowPda,
  getTsnTreasuryPda,
  getTsnVerifierPda,
  tsnExecuteVaultPayoutOnChain,
  tsnFetchMotherEscrowOnChain,
  tsnSubmitSenderSignedSettlementTransaction,
} from "../../tsn-sdk/src/blockchain/solana-tsn.ts";
import { verifySenderPaymentAuthorization } from "../../tsn-sdk/src/payment-authorization-server.ts";
import { VERIFIED_TSN_PROGRAM_ID } from "../../tsn-sdk/src/program.ts";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import "dotenv/config";

type TsnWorkItem = Awaited<ReturnType<ReturnType<typeof createMempoolClient>["listPendingWork"]>>[number];
type TsnIntentWorkItem = Awaited<ReturnType<ReturnType<typeof createMempoolClient>["listPendingIntentWork"]>>[number];

type MempoolOverview = {
  signature: string;
  line: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMempoolClient() {
  if (process.env.TSN_MEMPOOL_URL) {
    return new HttpTsnMempool(process.env.TSN_MEMPOOL_URL);
  }

  return new JsonFileTsnMempool();
}

async function fetchMempoolOverview(): Promise<MempoolOverview | null> {
  if (!process.env.TSN_MEMPOOL_URL) return null;

  const baseUrl = process.env.TSN_MEMPOOL_URL.replace(/\/$/, "");
  const fetchJson = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`GET ${path} failed (${response.status})`);
    return (await response.json()) as T;
  };

  const [intents, claims, intentWork, claimWork] = await Promise.all([
    fetchJson<Array<{ status: string }>>("/intents"),
    fetchJson<Array<{ status: string }>>("/claim-requests"),
    fetchJson<TsnIntentWorkItem[]>("/intent-work?limit=100"),
    fetchJson<TsnWorkItem[]>("/work?limit=100"),
  ]);
  const countByStatus = (items: Array<{ status: string }>) =>
    items.reduce<Record<string, number>>((counts, item) => {
      const displayStatus = item.status === "onchain" ? "escrowed" : item.status;
      counts[displayStatus] = (counts[displayStatus] ?? 0) + 1;
      return counts;
    }, {});
  const intentStatuses = countByStatus(intents);
  const claimStatuses = countByStatus(claims);
  const signature = JSON.stringify({
    intents: intentStatuses,
    claims: claimStatuses,
    intentWork: intentWork.length,
    claimWork: claimWork.length,
  });

  return {
    signature,
    line: `intents=${intents.length} ${JSON.stringify(intentStatuses)} claims=${claims.length} ${JSON.stringify(claimStatuses)} intentWork=${intentWork.length} claimWork=${claimWork.length}`,
  };
}

function loadOperatorKeypair() {
  const rawSecret = process.env.TSN_CRANKER_OPERATOR_SECRET_KEY?.trim();
  if (rawSecret) {
    const parsed = JSON.parse(rawSecret) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }

  const keypairPath = process.env.TSN_CRANKER_KEYPAIR_PATH ?? process.env.KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error("Set TSN_CRANKER_KEYPAIR_PATH or TSN_CRANKER_OPERATOR_SECRET_KEY for real cranker execution");
  }

  const parsed = JSON.parse(readFileSync(keypairPath, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

function hex32(value: string, label: string) {
  const buffer = Buffer.from(value, "hex");
  if (buffer.length !== 32) throw new Error(`${label} must be a 32-byte hex string`);
  return buffer;
}

function toBaseUnits(amountUi: number | string, decimals: number) {
  const raw = String(amountUi);
  const [whole, fraction = ""] = raw.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");
}

function encodeU64(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

function instructionDiscriminator(name: string) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function bufferEquals(left: Buffer | Uint8Array, right: Buffer | Uint8Array) {
  return Buffer.from(left).equals(Buffer.from(right));
}

function getRecipientAmountUi(item: TsnWorkItem) {
  const maybeRecipientAmount = Number((item.intent as TsnWorkItem["intent"] & { recipientAmount?: number }).recipientAmount);
  if (Number.isFinite(maybeRecipientAmount) && maybeRecipientAmount > 0 && maybeRecipientAmount <= Number(item.intent.amount)) {
    return maybeRecipientAmount;
  }

  return Number(item.intent.amount);
}

function parseAuthorizationMessage(message: string) {
  return Object.fromEntries(
    message
      .split("\n")
      .map((line) => line.split("="))
      .filter(([key, value]) => key && value != null)
      .map(([key, ...value]) => [key, value.join("=")]),
  );
}

function validateSignedSettlementTransaction(params: {
  item: TsnIntentWorkItem;
  operator: PublicKey;
  tokenDecimals: number;
}) {
  const intent = params.item.intent as TsnIntentWorkItem["intent"] & {
    senderWallet?: string | null;
    senderSignedSettlementTransaction?: string | null;
    senderSignedSettlementFeePayer?: string | null;
    senderTokenAccount?: string | null;
    settlementVault?: string | null;
    settlementTokenAccount?: string | null;
    settlementPaymentIntentId?: string | null;
  };
  if (!intent.senderSignedSettlementTransaction) return "missing sender co-signed settlement transaction";

  const transaction = Transaction.from(Buffer.from(intent.senderSignedSettlementTransaction, "base64"));
  if (!transaction.feePayer?.equals(params.operator)) {
    return `settlement transaction fee payer mismatch; expected ${params.operator.toBase58()}, got ${transaction.feePayer?.toBase58() ?? "missing"}`;
  }

  const senderWallet = new PublicKey(intent.senderWallet ?? "");
  const tokenMint = new PublicKey(params.item.intent.tokenMintAddress);
  const expectedAmount = toBaseUnits(params.item.intent.amount, params.tokenDecimals);
  const expectedSenderFeeAmount = toBaseUnits(
    Number((params.item.intent as TsnIntentWorkItem["intent"] & { senderFeeAmount?: number | null }).senderFeeAmount ?? 0),
    params.tokenDecimals,
  );
  const expectedProgramId = new PublicKey(VERIFIED_TSN_PROGRAM_ID);
  const expectedPaymentIntentId = BigInt(intent.settlementPaymentIntentId ?? "0");
  const expectedSenderTokenAccount = intent.senderTokenAccount ? new PublicKey(intent.senderTokenAccount) : null;
  const expectedSettlementVault = intent.settlementVault ? new PublicKey(intent.settlementVault) : null;
  const expectedSettlementTokenAccount = intent.settlementTokenAccount ? new PublicKey(intent.settlementTokenAccount) : null;
  const expectedTreasuryTokenAccount = getAssociatedTokenAddressSync(tokenMint, getTsnTreasuryPda(), true);
  const senderSignature = transaction.signatures.find((entry) => entry.publicKey.equals(senderWallet));
  if (!senderSignature?.signature) {
    return "settlement transaction is not signed by the sender wallet";
  }
  const unexpectedExtraPrograms = transaction.instructions
    .filter((instruction) => !instruction.programId.equals(ComputeBudgetProgram.programId))
    .filter(
      (instruction) =>
        !instruction.programId.equals(expectedProgramId) &&
        !instruction.programId.equals(TOKEN_PROGRAM_ID),
    )
    .map((instruction) => instruction.programId.toBase58());
  if (unexpectedExtraPrograms.length > 0) {
    return `settlement transaction contains unexpected extra program(s): ${unexpectedExtraPrograms.join(", ")}`;
  }

  const coreInstructions = transaction.instructions.filter(
    (instruction) => !instruction.programId.equals(ComputeBudgetProgram.programId),
  );
  const expectedCoreInstructionCount = expectedSenderFeeAmount > 0n ? 3 : 2;
  if (coreInstructions.length !== expectedCoreInstructionCount) {
    const programList = transaction.instructions
      .map((instruction) => instruction.programId.toBase58())
      .join(",");
    return `settlement transaction must contain ${expectedCoreInstructionCount} core escrow instructions after compute-budget instructions, got ${coreInstructions.length}; programs=${programList}`;
  }

  const processIntentIx = coreInstructions[0];
  const transferIx = coreInstructions[1];
  const senderFeeTransferIx = expectedSenderFeeAmount > 0n ? coreInstructions[2] : null;
  if (!processIntentIx.programId.equals(expectedProgramId)) return "first settlement instruction is not TSN tsn_process_payment_intent";
  if (!transferIx.programId.equals(TOKEN_PROGRAM_ID)) return "second settlement instruction is not SPL Token transfer_checked";
  if (senderFeeTransferIx && !senderFeeTransferIx.programId.equals(TOKEN_PROGRAM_ID)) {
    return "third settlement instruction is not SPL Token sender-fee transfer_checked";
  }
  if (processIntentIx.data.length !== 24) return "process_payment_intent instruction data length mismatch";
  if (transferIx.data.length !== 10) return "SPL Token transfer_checked data length mismatch";
  if (senderFeeTransferIx && senderFeeTransferIx.data.length !== 10) return "sender-fee SPL Token transfer_checked data length mismatch";
  if (!bufferEquals(processIntentIx.data.subarray(0, 8), instructionDiscriminator("tsn_process_payment_intent"))) {
    return "invalid tsn_process_payment_intent discriminator";
  }
  if (!processIntentIx.keys[0]?.pubkey.equals(params.operator)) return "process_payment_intent cranker signer mismatch";
  if (expectedSettlementVault && !processIntentIx.keys[2]?.pubkey.equals(expectedSettlementVault)) {
    return "process_payment_intent vault PDA mismatch";
  }
  if (expectedSettlementTokenAccount && !processIntentIx.keys[3]?.pubkey.equals(expectedSettlementTokenAccount)) {
    return "process_payment_intent vault token account mismatch";
  }
  if (!processIntentIx.keys[4]?.pubkey.equals(tokenMint)) return "process_payment_intent mint mismatch";
  if (!bufferEquals(processIntentIx.data.subarray(8, 16), encodeU64(expectedPaymentIntentId))) {
    return "process_payment_intent payment id mismatch";
  }
  if (!bufferEquals(processIntentIx.data.subarray(16, 24), encodeU64(expectedAmount))) {
    return "process_payment_intent amount mismatch";
  }

  if (transferIx.data[0] !== 12) return "SPL Token instruction is not transfer_checked";
  const transferAmount = transferIx.data.readBigUInt64LE(1);
  const transferDecimals = transferIx.data[9];
  if (transferAmount !== expectedAmount) return "SPL Token transfer amount mismatch";
  if (transferDecimals !== params.tokenDecimals) return "SPL Token transfer decimals mismatch";
  if (expectedSenderTokenAccount && !transferIx.keys[0]?.pubkey.equals(expectedSenderTokenAccount)) {
    return "SPL Token source account mismatch";
  }
  if (!transferIx.keys[1]?.pubkey.equals(tokenMint)) return "SPL Token mint mismatch";
  if (expectedSettlementTokenAccount && !transferIx.keys[2]?.pubkey.equals(expectedSettlementTokenAccount)) {
    return "SPL Token destination account mismatch";
  }
  if (!transferIx.keys[3]?.pubkey.equals(senderWallet)) return "SPL Token owner signer mismatch";

  if (senderFeeTransferIx) {
    if (senderFeeTransferIx.data[0] !== 12) return "sender-fee SPL Token instruction is not transfer_checked";
    const senderFeeTransferAmount = senderFeeTransferIx.data.readBigUInt64LE(1);
    const senderFeeTransferDecimals = senderFeeTransferIx.data[9];
    if (senderFeeTransferAmount !== expectedSenderFeeAmount) return "sender-fee SPL Token transfer amount mismatch";
    if (senderFeeTransferDecimals !== params.tokenDecimals) return "sender-fee SPL Token transfer decimals mismatch";
    if (expectedSenderTokenAccount && !senderFeeTransferIx.keys[0]?.pubkey.equals(expectedSenderTokenAccount)) {
      return "sender-fee SPL Token source account mismatch";
    }
    if (!senderFeeTransferIx.keys[1]?.pubkey.equals(tokenMint)) return "sender-fee SPL Token mint mismatch";
    if (!senderFeeTransferIx.keys[2]?.pubkey.equals(expectedTreasuryTokenAccount)) {
      return "sender-fee SPL Token destination must be TSN treasury token account";
    }
    if (!senderFeeTransferIx.keys[3]?.pubkey.equals(senderWallet)) return "sender-fee SPL Token owner signer mismatch";
  }

  return null;
}

async function validateIntentWork(params: {
  item: TsnIntentWorkItem;
  operator: PublicKey;
  tokenDecimals: number;
}) {
  const item = params.item;
  const intent = item.intent as TsnIntentWorkItem["intent"] & {
    senderWallet?: string | null;
    senderAuthorizationMessage?: string | null;
    senderAuthorizationSignature?: string | null;
    senderAuthorizationNonce?: string | null;
    senderAuthorizationIssuedAt?: string | null;
    senderAuthorizationExpiresAt?: string | null;
    senderSignedSettlementTransaction?: string | null;
    senderSignedSettlementFeePayer?: string | null;
    senderSettlementMode?: string | null;
    senderTokenAccount?: string | null;
    settlementVault?: string | null;
    settlementTokenAccount?: string | null;
    settlementPaymentIntentId?: string | null;
  };
  const expectedIntentSeedHash = createHash("sha256").update(item.intent.paymentId).digest("hex");
  if (item.intent.intentSeedHash !== expectedIntentSeedHash) {
    return `intentSeedHash mismatch for paymentId=${item.intent.paymentId}`;
  }
  if (!Number.isFinite(Number(item.intent.amount)) || Number(item.intent.amount) <= 0) {
    return "intent amount must be greater than zero";
  }
  try {
    hex32(item.intent.recipientHash, "recipientHash");
    new PublicKey(item.intent.tokenMintAddress);
    new PublicKey(item.intent.underlyingPayment ?? "");
    new PublicKey(intent.senderWallet ?? "");
  } catch (error) {
    return error instanceof Error ? error.message : "intent contains invalid public key or hash";
  }
  if (!intent.senderWallet || !intent.senderAuthorizationMessage || !intent.senderAuthorizationSignature) {
    return "missing sender payment authorization";
  }
  if (intent.senderSettlementMode !== "sponsored_sender_cosigned") {
    return "unsupported sender settlement mode";
  }
  if (!intent.senderSignedSettlementTransaction) {
    return "missing sender co-signed settlement transaction";
  }
  if (!intent.senderSignedSettlementFeePayer) {
    return "missing sponsored settlement fee payer";
  }
  if (intent.senderSignedSettlementFeePayer !== params.operator.toBase58()) {
    return "sponsored settlement fee payer does not match this cranker";
  }
  if (!intent.senderAuthorizationNonce) {
    return "missing sender authorization nonce";
  }
  if (!intent.senderAuthorizationIssuedAt) {
    return "missing sender authorization issue timestamp";
  }
  if (!intent.senderAuthorizationExpiresAt) {
    return "missing sender authorization expiry";
  }
  if (intent.senderAuthorizationExpiresAt) {
    const expiresAt = Date.parse(intent.senderAuthorizationExpiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      return "sender authorization has expired";
    }
  }
  const authorization = parseAuthorizationMessage(intent.senderAuthorizationMessage);
  if (authorization.senderWallet !== intent.senderWallet) {
    return "sender authorization wallet mismatch";
  }
  if (authorization.tokenMintAddress !== item.intent.tokenMintAddress) {
    return "sender authorization token mint mismatch";
  }
  const authorizedTotal = Number(authorization.totalTokenRequiredUi);
  const authorizedAmount = Number(authorization.amount);
  const authorizedSenderFeeAmount = Number(authorization.senderFeeAmount ?? 0);
  if (!Number.isFinite(authorizedAmount) || Math.abs(authorizedAmount - Number(item.intent.amount)) > 0.000001) {
    return "sender authorization amount mismatch";
  }
  if (
    !Number.isFinite(authorizedSenderFeeAmount) ||
    Math.abs(authorizedSenderFeeAmount - Number((item.intent as TsnIntentWorkItem["intent"] & { senderFeeAmount?: number | null }).senderFeeAmount ?? 0)) > 0.000001
  ) {
    return "sender authorization fee mismatch";
  }
  if (!Number.isFinite(authorizedTotal) || Math.abs(authorizedTotal - (authorizedAmount + authorizedSenderFeeAmount)) > 0.000001) {
    return "sender authorization total mismatch";
  }
  if (authorization.nonce !== intent.senderAuthorizationNonce) {
    return "sender authorization nonce mismatch";
  }
  if (authorization.issuedAt !== intent.senderAuthorizationIssuedAt) {
    return "sender authorization issue timestamp mismatch";
  }
  if (authorization.expiresAt !== intent.senderAuthorizationExpiresAt) {
    return "sender authorization expiry mismatch";
  }
  const signatureValid = await verifySenderPaymentAuthorization({
    senderWallet: intent.senderWallet,
    message: intent.senderAuthorizationMessage,
    signatureBase64: intent.senderAuthorizationSignature,
  });
  if (!signatureValid) {
    return "sender authorization signature verification failed";
  }
  const transactionInvalidReason = validateSignedSettlementTransaction({
    item,
    operator: params.operator,
    tokenDecimals: params.tokenDecimals,
  });
  if (transactionInvalidReason) {
    return transactionInvalidReason;
  }
  return null;
}

async function submitIntentOnChainWork(params: {
  item: TsnIntentWorkItem;
  mempool: ReturnType<typeof createMempoolClient>;
  operator: Keypair;
  rpcUrl: string;
  tokenDecimals: number;
}) {
  const sponsoredSettlement = params.item.intent as TsnIntentWorkItem["intent"] & {
    senderSignedSettlementTransaction?: string | null;
    senderSignedSettlementFeePayer?: string | null;
    settlementVault?: string | null;
  };
  if (!sponsoredSettlement.senderSignedSettlementTransaction) {
    throw new Error("Sponsored settlement transaction is required; public PaymentIntent PDA creation is disabled.");
  }

  const created = await tsnSubmitSenderSignedSettlementTransaction({
    operator: params.operator,
    signedTransactionBase64: sponsoredSettlement.senderSignedSettlementTransaction,
    rpcUrl: params.rpcUrl,
  });

  await params.mempool.updateIntentStatus(params.item.intent.id, "escrowed", {
    source: params.item.intent.source,
    assignedCrankerPubkey: params.operator.publicKey.toBase58(),
    escrowTxSig: created.signature,
    settlementReason:
      "Cranker verified the sender authorization, sponsored the sender co-signed escrow transaction, and locked funds into the private TSN vault.",
  } as Partial<TsnIntentWorkItem["intent"]>);

  return {
    intent: sponsoredSettlement.settlementVault ?? params.item.intent.id,
    signature: created.signature,
    created: true,
  };
}

async function executeClaimWork(params: {
  item: TsnWorkItem;
  mempool: ReturnType<typeof createMempoolClient>;
  operator: Keypair;
  rpcUrl: string;
  tokenDecimals: number;
}) {
  const tokenMint = new PublicKey(params.item.intent.tokenMintAddress);
  const recipientWallet = new PublicKey(params.item.claimRequest.destinationWallet);
  const payoutAmountBaseUnits = toBaseUnits(getRecipientAmountUi(params.item), params.tokenDecimals);
  const claimFeeAmountBaseUnits = toBaseUnits(
    Math.max(0, Number(params.item.intent.amount) - getRecipientAmountUi(params.item)),
    params.tokenDecimals,
  );
  const payout = await tsnExecuteVaultPayoutOnChain({
    operator: params.operator,
    tokenMint,
    recipientWallet,
    payoutAmountBaseUnits,
    claimFeeAmountBaseUnits,
    rpcUrl: params.rpcUrl,
  });

  return {
    intent: (params.item.intent as TsnWorkItem["intent"] & { settlementVault?: string | null }).settlementVault ?? params.item.intent.id,
    proofSignature: payout.signature,
  };
}

async function postHeartbeat(operator: string) {
  if (!process.env.TSN_MEMPOOL_URL) return;

  try {
    const response = await fetch(`${process.env.TSN_MEMPOOL_URL.replace(/\/$/, "")}/crankers/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operator_pubkey: operator,
        cranker_pubkey: process.env.TSN_CRANKER_PDA ?? null,
        version: "reference-cranker",
        source: "tsn-cranker-op-daemon",
      }),
    });

    if (!response.ok) {
      console.warn(`[tsn-cranker] heartbeat failed status=${response.status}`);
    }
  } catch (error) {
    console.warn("[tsn-cranker] heartbeat failed", error);
  }
}

async function assertCrankerRegistered(params: {
  operator: PublicKey;
  motherEscrow: PublicKey;
  rpcUrl: string;
}) {
  const cranker = getTsnCrankerPda({
    motherEscrow: params.motherEscrow,
    operator: params.operator,
  });
  const connection = new Connection(params.rpcUrl, "confirmed");
  const account = await connection.getAccountInfo(cranker, "confirmed");
  if (!account) {
    throw new Error(
      `TSN cranker PDA is not initialized for this operator/program. operator=${params.operator.toBase58()} cranker=${cranker.toBase58()} motherEscrow=${params.motherEscrow.toBase58()}. Run npm --prefix tsn-cranker-op-daemon run register, then restart the cranker.`,
    );
  }

  console.log(`[tsn-cranker] cranker=${cranker.toBase58()} registered lamports=${account.lamports}`);
  return cranker;
}

async function logVerifierReservoir(rpcUrl: string) {
  const verifierPda = getTsnVerifierPda();
  const connection = new Connection(rpcUrl, "confirmed");
  const balanceLamports = await connection.getBalance(verifierPda, "confirmed");
  console.log(`[tsn-cranker] verifierPda=${verifierPda.toBase58()} lamports=${balanceLamports}`);
  if (balanceLamports < 5_000_000) {
    console.warn(
      `[tsn-cranker] verifier-low-balance fund with: npm run tsn:verifier:fund -- <keypairPath> 0.05`,
    );
  }
}

async function main() {
  const mempool = createMempoolClient();
  const operatorKeypair = loadOperatorKeypair();
  const operator = operatorKeypair.publicKey.toBase58();
  if (process.env.TSN_CRANKER_OPERATOR_PUBKEY && process.env.TSN_CRANKER_OPERATOR_PUBKEY !== operator) {
    console.warn(
      `[tsn-cranker] ignoring TSN_CRANKER_OPERATOR_PUBKEY=${process.env.TSN_CRANKER_OPERATOR_PUBKEY}; using signer keypair ${operator}`,
    );
  }
  const rpcUrl = process.env.RPC_URL ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const tokenDecimals = Number(process.env.TSN_CRANKER_TOKEN_DECIMALS ?? 6);
  let claimCredit = Number(process.env.TSN_CRANKER_INITIAL_CLAIM_CREDIT ?? 0);

  console.log(`[tsn-cranker] operator=${operator}`);
  console.log("[tsn-cranker] source=tsn-mempool");
  console.log("[tsn-cranker] execution=real-onchain");

  const motherEscrowState = await tsnFetchMotherEscrowOnChain(rpcUrl);
  if (!motherEscrowState?.valid) {
    const reason = motherEscrowState ? motherEscrowState.reason : "missing";
    const dataLength =
      motherEscrowState && "dataLength" in motherEscrowState
        ? motherEscrowState.dataLength
        : null;
    throw new Error(
      `TSN mother escrow is not readable for ${rpcUrl}; reason=${reason}${dataLength != null ? ` dataLength=${dataLength}` : ""}. Run npm run tsn:mother:migrate, then restart the cranker.`,
    );
  }
  console.log(`[tsn-cranker] motherEscrow=${motherEscrowState.address}`);
  console.log(`[tsn-cranker] treasuryPda=${getTsnTreasuryPda().toBase58()}`);
  await logVerifierReservoir(rpcUrl);
  await assertCrankerRegistered({
    operator: operatorKeypair.publicKey,
    motherEscrow: new PublicKey(motherEscrowState.address),
    rpcUrl,
  });

  let lastMempoolOverviewSignature = "";
  const logMempoolOverview = async (reason: string) => {
    try {
      const overview = await fetchMempoolOverview();
      if (!overview) return;
      if (overview.signature !== lastMempoolOverviewSignature || reason === "startup") {
        lastMempoolOverviewSignature = overview.signature;
        console.log(`[tsn-cranker] mempool.${reason} ${overview.line}`);
      }
    } catch (error) {
      console.warn("[tsn-cranker] mempool.status_failed", error);
    }
  };
  await logMempoolOverview("startup");

  while (true) {
    await postHeartbeat(operator);
    await logMempoolOverview("changed");

    const intentWork = await mempool.listPendingIntentWork(20);
    for (const item of intentWork) {
      try {
        const sponsoredFeePayer = (item.intent as TsnIntentWorkItem["intent"] & {
          senderSignedSettlementFeePayer?: string | null;
        }).senderSignedSettlementFeePayer;
        if (sponsoredFeePayer && sponsoredFeePayer !== operator) {
          continue;
        }

        const invalidReason = await validateIntentWork({
          item,
          operator: operatorKeypair.publicKey,
          tokenDecimals,
        });
        if (invalidReason) {
          await mempool.updateIntentStatus(item.intent.id, "canceled", {
            source: item.intent.source,
            settlementResolution: "reverted",
            settlementReason: `Cranker fraud-protection preflight rejected payment intent: ${invalidReason}`,
          });
          console.warn(`[tsn-cranker] canceled-invalid-intent intent=${item.intent.id} reason="${invalidReason}"`);
          continue;
        }

        const submitted = await submitIntentOnChainWork({
          item,
          mempool,
          operator: operatorKeypair,
          rpcUrl,
          tokenDecimals,
        });
        claimCredit += 1;
        console.log(
          `[tsn-cranker] submitted-intent intent=${item.intent.id} escrowed=${submitted.intent} tx=${submitted.signature} claimCredit=${claimCredit}`,
        );
      } catch (error) {
        console.error(`[tsn-cranker] failed-intent-submission intent=${item.intent.id}`, error);
      }
    }

    const work = await mempool.listPendingWork(20);
    for (const item of work) {
      try {
        if (claimCredit <= 0) {
          console.log(
            `[tsn-cranker] claim-work-waiting claimCredit=0 pendingClaim=${item.claimRequest.id} intent=${item.intent.id}; submit a payment intent first`,
          );
          break;
        }

        await mempool.updateClaimRequestStatus(
          item.claimRequest.id,
          "processing",
        );

        const economics = evaluateSettlementEconomics({
          paymentAmountUi: item.intent.amount,
          tokenUsd: Number(process.env.TSN_CRANKER_TOKEN_USD ?? 1),
          estimatedExecutionCostLamports: Number(
            process.env.TSN_CRANKER_EXECUTION_LAMPORTS ?? 20_000,
          ),
          ataCreationCostLamports: Number(
            process.env.TSN_CRANKER_ATA_LAMPORTS ?? 2_039_280,
          ),
          solUsd: Number(process.env.TSN_CRANKER_SOL_USD ?? 150),
          operatorFeeUi: Number(
            process.env.TSN_CRANKER_OPERATOR_FEE_UI ?? 0.02,
          ),
          safetyMultiplier: Number(
            process.env.TSN_CRANKER_SAFETY_MULTIPLIER ?? 1.25,
          ),
        });

        if (economics.likelihood === "economically_non_claimable") {
          await mempool.updateIntentStatus(item.intent.id, "reverted", {
            source: item.intent.source,
            settlementResolution: "reverted",
            settlementReason: economics.reason,
          });
          await mempool.updateClaimRequestStatus(
            item.claimRequest.id,
            "completed",
            {
              settlementReason: economics.reason,
            },
          );
          console.log(
            `[tsn-cranker] reverted intent=${item.intent.id} claim=${item.claimRequest.id} reason="${economics.reason}"`,
          );
          continue;
        }

        const execution = await executeClaimWork({
          item,
          mempool,
          operator: operatorKeypair,
          rpcUrl,
          tokenDecimals,
        });

        const proofTxSig = execution.proofSignature;
        await mempool.postProof({
          intent_id: item.intent.id,
          timestamp: new Date().toISOString(),
          cranker_pubkey: operator,
          proof_tx: proofTxSig,
          encrypted_payload: null,
        });

        await mempool.updateIntentStatus(item.intent.id, "executed", {
          source: item.intent.source,
          proofTxSig,
          settlementResolution: "completed",
          settlementReason: economics.reason,
        });
        await mempool.updateClaimRequestStatus(
          item.claimRequest.id,
          "completed",
          {
            settlementReason: economics.reason,
          },
        );
        claimCredit -= 1;

        console.log(
          `[tsn-cranker] executed-claim intent=${item.intent.id} escrowed=${execution.intent} claim=${item.claimRequest.id} proof=${proofTxSig} claimCredit=${claimCredit}`,
        );
      } catch (error) {
        await mempool
          .updateClaimRequestStatus(item.claimRequest.id, "failed")
          .catch(() => undefined);
        console.error(`[tsn-cranker] failed intent=${item.intent.id}`, error);
      }
    }

    await sleep(Number(process.env.TSN_CRANKER_POLL_MS ?? 2000));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
