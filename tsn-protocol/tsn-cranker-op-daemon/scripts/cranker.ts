import { HttpTsnMempool } from "../../tsn-sdk/src/mempool";
import type { TsnMempool } from "../../tsn-sdk/src/mempool";
import { evaluateSettlementEconomics } from "../../tsn-sdk/src/settlement-economics";
import {
  getTsnCrankerPda,
  getTsnMotherEscrowPda,
  getTsnTreasuryPda,
  getTsnVerifierPda,
  tsnClaimVaultRecoveryOnChain,
  tsnClaimVaultSettlementOnChain,
  tsnExecuteVaultPayoutOnChain,
  tsnFetchMotherEscrowOnChain,
  tsnProcessBatchReimbursementOnChain,
  tsnRecoverPaymentVaultOnChain,
  tsnSubmitSenderSignedSettlementTransaction,
} from "../../tsn-sdk/src/blockchain/solana-tsn";
import {
  getTsnPrivateReplayRegistryPda,
  getTsnSharedEscrowAuthorityPda,
  tsnExecutePrivatePayoutOnChain,
  tsnRecoverPrivateEscrowOnChain,
} from "../../tsn-sdk/src/worker/private-settlement";
import { verifySenderPaymentAuthorization } from "../../tsn-sdk/src/payment-authorization-server";
import {
  parseMixedPaymentMessage,
  parsePaymentIntentMessage,
  parsePruSpendMessage,
} from "../../tsn-sdk/src/canonical-message";
import { VERIFIED_TSN_PROGRAM_ID } from "../../tsn-sdk/src/program";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import { readFileSync } from "node:fs";
import {
  createOwnerIntentSignatureInstruction,
  DEFAULT_TIP_PROGRAM_ID,
  getTinsGlobalStatePda,
  getTinsIdentityPda,
  getTinsMutationStagingPda,
  serializeTinCreationRegistryParams,
  serializeTinMutationChunkParams,
  serializeTinMutationStageParams,
  serializeTinUpdateStagedParams,
  serializeTinUpdateParams,
} from "../../tsn-sdk/src";

import type { TsnTinOperationRecord } from "../../tsn-sdk/src/contracts.ts";
import { traceFunction } from "../../../utils/observability/tracer";

import "dotenv/config";
import { resolveSolanaRpcUrl } from "../../tsn-sdk/src/rpc";

type TsnWorkItem = Awaited<
  ReturnType<ReturnType<typeof createMempoolClient>["listPendingWork"]>
>[number];
type TsnIntentWorkItem = Awaited<
  ReturnType<ReturnType<typeof createMempoolClient>["listPendingIntentWork"]>
>[number];
type TsnRecoveryWorkItem = Awaited<
  ReturnType<ReturnType<typeof createMempoolClient>["listPendingRecoveryWork"]>
>[number];

type MempoolOverview = {
  signature: string;
  line: string;
};

type ReceiverStatusSummary = {
  signature: string;
  line: string;
};

type EpochRaceCacheEntry = {
  lastSeenSlot: number;
  lastRootHash?: string;
  submittedAt?: number;
};

const epochRaceCache = new Map<string, EpochRaceCacheEntry>();
const shutdownControllers: number[] = [];
let shuttingDown = false;

function parsePubkeyList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => new PublicKey(entry));
}

function epochChallengeCacheKey(epoch: number, rootHash: string) {
  return `${epoch}:${rootHash}`;
}

function isMissingMempoolEndpoint(error: unknown) {
  return (
    error instanceof Error && /TSN request failed \(404\)/.test(error.message)
  );
}

function shouldUseAccountSubscriptions(rpcUrl: string) {
  // WebSocket monitoring is optional. Require explicit opt-in so a stale
  // SOLANA_WS_URL inherited by a shell cannot create reconnect storms or
  // consume provider quota. Receiver polling remains authoritative.
  if (process.env.TSN_ENABLE_SOLANA_SUBSCRIPTIONS !== "true") return false;
  if (process.env.SOLANA_WS_URL) return true;
  return !/^https?:\/\/(127\.0\.0\.1|localhost):8787\b/.test(rpcUrl);
}

async function dynamicPriorityFeeMicroLamports(connection: Connection) {
  const configured = process.env.TSN_CRANKER_PRIORITY_FEE_MICROLAMPORTS;
  if (configured) return Number(configured);
  try {
    const fees = await connection.getRecentPrioritizationFees();
    const sorted = fees
      .map((fee) => fee.prioritizationFee)
      .filter((fee) => Number.isFinite(fee) && fee > 0)
      .sort((left, right) => left - right);
    if (sorted.length === 0) return 0;
    const percentileIndex = Math.min(
      sorted.length - 1,
      Math.floor(sorted.length * 0.75),
    );
    return Math.min(
      sorted[percentileIndex],
      Number(process.env.TSN_CRANKER_PRIORITY_FEE_CAP_MICROLAMPORTS ?? 250_000),
    );
  } catch {
    return 0;
  }
}

function installShutdownHandlers() {
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const subscriptionId of shutdownControllers.splice(0)) {
      // Best-effort cleanup; connection-scoped removals are handled by each subscription owner.
      void subscriptionId;
    }
    console.log(
      "[tsn-cranker] shutdown requested; finishing current loop and exiting",
    );
    setTimeout(() => process.exit(0), 25).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function receiverUrl() {
  return process.env.TSN_RECEIVER_URL || "https://tsn-receiver-kappa.vercel.app";
}

function safeHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

type ReceiverWork = {
  id: string;
  kind: "PAYMENT_INTENT" | "CLAIM" | "TIN_OPERATION" | "RECOVERY";
  status: string;
  stateVersion: number;
  payload: Record<string, unknown>;
  verification?: { verifiedPayload?: Record<string, unknown> } | null;
  authorization?: Record<string, unknown> | null;
};

type OpaqueRouteAuthorization = {
  version: number;
  message: string;
  signatureBase64: string;
  signerPublicKeyBase64: string;
  destination: string;
  routeCommitment: string;
  expiresAt: string;
};

function canonicalRouteAmount(value: unknown): string {
  const raw = typeof value === "number" ? value.toString() : String(value ?? "").trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) {
    throw new Error("Node route authorization amount is not numeric");
  }
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = raw.replace(/^[+-]/, "");
  const [coefficient, exponentText] = unsigned.toLowerCase().split("e");
  const exponent = Number(exponentText ?? 0);
  const [whole = "0", fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`;
  const decimalPosition = whole.length + exponent;
  const expanded = decimalPosition <= 0
    ? `0.${"0".repeat(-decimalPosition)}${digits}`
    : decimalPosition >= digits.length
      ? `${digits}${"0".repeat(decimalPosition - digits.length)}`
      : `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
  const [expandedWhole, expandedFraction = ""] = expanded.split(".");
  const normalizedWhole = expandedWhole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = expandedFraction.replace(/0+$/, "");
  const normalized = normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
  if (sign || normalized !== "0") return `${sign}${normalized}`;
  return "0";
}

function verifyOpaqueRouteAuthorization(workId: string, payload: Record<string, unknown>) {
  const route = payload.routeAuthorization as OpaqueRouteAuthorization | undefined;
  if (!route || route.version !== 1) throw new Error("Node route authorization is missing");
  const expectedSigner = process.env.TSN_ROUTE_ATTESTATION_PUBLIC_KEY_BASE64?.trim();
  if (!expectedSigner || route.signerPublicKeyBase64 !== expectedSigner) {
    throw new Error("Node route authorization signer is not trusted");
  }
  if (Date.parse(route.expiresAt) <= Date.now()) throw new Error("Node route authorization expired");
  if (route.destination !== payload.recipientWallet) throw new Error("Node route destination mismatch");
  const fields = new Map(route.message.split("\n").slice(1).map((line) => {
    const offset = line.indexOf("=");
    return [line.slice(0, offset), line.slice(offset + 1)];
  }));
  if (route.message.split("\n")[0] !== "TSN_ROUTE_AUTHORIZATION" ||
      fields.get("workId") !== workId || fields.get("destination") !== route.destination ||
      fields.get("routeCommitment") !== route.routeCommitment ||
      fields.get("mint") !== payload.tokenMintAddress ||
      canonicalRouteAmount(fields.get("amount")) !== canonicalRouteAmount(payload.amount) ||
      fields.get("expiry") !== route.expiresAt || fields.get("programId") !== VERIFIED_TSN_PROGRAM_ID) {
    throw new Error("Node route authorization does not bind the exact settlement");
  }
  const valid = nacl.sign.detached.verify(
    Buffer.from(route.message, "utf8"),
    Buffer.from(route.signatureBase64, "base64"),
    Buffer.from(route.signerPublicKeyBase64, "base64"),
  );
  if (!valid) throw new Error("Node route authorization signature is invalid");
}

async function receiverRequest<T>(method: "POST" | "PATCH", body: Record<string, unknown>) {
  const baseUrl = receiverUrl();
  const apiKey = process.env.TSN_RECEIVER_CRANKER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("TSN Receiver Cranker configuration is incomplete");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/cranker/work`, {
    method,
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`TSN Receiver request failed (${response.status}): ${detail}`);
  }
  return await response.json() as T;
}

function assertReceiverCredential(operator: string) {
  const credential = process.env.TSN_RECEIVER_CRANKER_API_KEY?.trim() ?? "";
  if (!credential) {
    throw new Error("TSN_RECEIVER_CRANKER_API_KEY is required for Receiver work leasing");
  }
  // A TIN is public identity data, not a Receiver service credential. Catch
  // the common misconfiguration before the daemon enters a silent retry loop.
  if (/^\d{10}$/.test(credential)) {
    throw new Error("TSN_RECEIVER_CRANKER_API_KEY is a TIN, not the Receiver Cranker service credential");
  }
  if (credential.length < 32) {
    throw new Error("TSN_RECEIVER_CRANKER_API_KEY must be a generated service credential (at least 32 characters)");
  }
  void operator;
}

async function reportReceiverWork(params: {
  work: ReceiverWork;
  operator: string;
  status: "SUBMITTED" | "CONFIRMED" | "FAILED";
  evidence: Record<string, unknown>;
}) {
  return receiverRequest<ReceiverWork>("PATCH", {
    id: params.work.id,
    owner: params.operator,
    expectedVersion: params.work.stateVersion,
    status: params.status,
    evidence: params.evidence,
  });
}

async function processReceiverPaymentIntent(params: {
  work: ReceiverWork;
  operator: Keypair;
  rpcUrl: string;
  tokenDecimals: number;
}) {
  const verified = params.work.verification?.verifiedPayload;
  if (!verified) throw new Error("Receiver work has no TSN Node verified payload");
  verifyOpaqueRouteAuthorization(params.work.id, verified);
  const intent = {
    ...verified,
    id: params.work.id,
    status: "pending",
  } as unknown as TsnIntentWorkItem["intent"];
  const item = { intent } satisfies TsnIntentWorkItem;
  let submittedEvidence: Record<string, unknown> = {};
  const receiverMempool = {
    updateIntentStatus: async (_id: string, _status: unknown, patch?: Record<string, unknown>) => {
      submittedEvidence = { ...submittedEvidence, ...(patch ?? {}) };
      return intent;
    },
  } as unknown as TsnMempool;
  const submitted = await tracedSubmitIntentOnChainWork({
    item,
    mempool: receiverMempool,
    operator: params.operator,
    rpcUrl: params.rpcUrl,
    tokenDecimals: params.tokenDecimals,
  });
  await reportReceiverWork({
    work: params.work,
    operator: params.operator.publicKey.toBase58(),
    status: "CONFIRMED",
    evidence: {
      ...submittedEvidence,
      signature: submitted.signature,
      onchainIntent: submitted.intent,
      stage: "INTENT_CONFIRMED",
    },
  });
}

async function processReceiverClaim(params: { work: ReceiverWork; operator: Keypair; rpcUrl: string }) {
  const authorization = params.work.authorization;
  if (!authorization || authorization.kind !== "TSN_PAYOUT_AUTHORIZATION") {
    throw new Error("Receiver claim has no immutable Node settlement authorization");
  }
  const expiresAtTs = BigInt(String(authorization.expiresAtTs));
  if (expiresAtTs <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error("Receiver claim settlement authorization expired");
  }
  const payout = await tsnExecutePrivatePayoutOnChain({
    operator: params.operator,
    permitSigner: new PublicKey(String(authorization.authorizationSigner)),
    permitSignature: Uint8Array.from(Buffer.from(String(authorization.authorizationSignatureBase64), "base64")),
    payoutNullifier: hex32(String(authorization.payoutNullifier), "payoutNullifier"),
    payoutSequence: BigInt(String(authorization.payoutSequence)),
    tokenMint: new PublicKey(String(authorization.tokenMintAddress)),
    recipientWallet: new PublicKey(String(authorization.recipientWallet)),
    payoutAmount: BigInt(String(authorization.payoutAmountBaseUnits)),
    claimFeeAmount: BigInt(String(authorization.claimFeeAmountBaseUnits)),
    expiresAtTs,
    rpcUrl: params.rpcUrl,
  });
  console.log(
    `[tsn-cranker] claim.payout_submitted claim=${params.work.id} ` +
      `intent=${String(params.work.payload.intentId ?? "unknown")} tx=${payout.signature}`,
  );
  await reportReceiverWork({
    work: params.work,
    operator: params.operator.publicKey.toBase58(),
    status: "CONFIRMED",
    evidence: { stage: "PAYOUT_CONFIRMED", signature: payout.signature, routeCommitment: authorization.routeCommitment },
  });
}

async function processReceiverRecovery(params: { work: ReceiverWork; operator: Keypair; rpcUrl: string }) {
  const authorization = params.work.authorization;
  if (!authorization || authorization.kind !== "TSN_RECOVERY_AUTHORIZATION") {
    throw new Error("Receiver recovery has no immutable Node settlement authorization");
  }
  const expiresAtTs = BigInt(String(authorization.expiresAtTs));
  if (expiresAtTs <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("Recovery authorization expired");
  const recovery = await tsnRecoverPrivateEscrowOnChain({
    operator: params.operator,
    permitSigner: new PublicKey(String(authorization.authorizationSigner)),
    permitSignature: Uint8Array.from(Buffer.from(String(authorization.authorizationSignatureBase64), "base64")),
    recoveryNullifier: hex32(String(authorization.recoveryNullifier), "recoveryNullifier"),
    recoverySequence: BigInt(String(authorization.recoverySequence)),
    escrowTokenAccount: new PublicKey(String(authorization.escrowTokenAccount)),
    settlementCrankerOperator: new PublicKey(String(authorization.settlementCrankerPubkey)),
    tokenMint: new PublicKey(String(authorization.tokenMintAddress)),
    recoveryAmount: BigInt(String(authorization.recoveryAmountBaseUnits)),
    expiresAtTs,
    rpcUrl: params.rpcUrl,
  });
  console.log(
    `[tsn-cranker] recovery.submitted work=${params.work.id} ` +
      `payment=${String(params.work.payload.paymentId ?? "unknown")} tx=${recovery.signature}`,
  );
  await reportReceiverWork({
    work: params.work,
    operator: params.operator.publicKey.toBase58(),
    status: "CONFIRMED",
    evidence: { stage: "RECOVERY_CONFIRMED", signature: recovery.signature },
  });
}

function createMempoolClient() {
  const url = receiverUrl();
  if (!url) {
    throw new Error(
      "TSN_RECEIVER_URL is required; Crankers cannot read a local JSON queue",
    );
  }
  return new HttpTsnMempool(url);
}

async function fetchMempoolOverview(): Promise<MempoolOverview | null> {
  const receiver = receiverUrl();
  if (!receiver) return null;

  const baseUrl = receiver.replace(/\/$/, "");
  const fetchJson = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        accept: "application/json",
        ...(process.env.TSN_MEMPOOL_API_KEY
          ? { "x-api-key": process.env.TSN_MEMPOOL_API_KEY }
          : {}),
      },
    });
    if (!response.ok)
      throw new Error(`GET ${path} failed (${response.status})`);
    return (await response.json()) as T;
  };

  const operator = process.env.TSN_CRANKER_OPERATOR_PUBKEY ?? "";
  const [
    intents,
    claims,
    recoveries,
    tinOperations,
    intentWork,
    claimWork,
    recoveryWork,
    tinVerificationWork,
    tinFeeWork,
    tinRegistryWork,
  ] = await Promise.all([
    fetchJson<Array<{ status: string }>>("/intents"),
    fetchJson<Array<{ status: string }>>("/claim-requests"),
    fetchJson<Array<{ status: string }>>("/recoveries"),
    fetchJson<Array<{ status: string }>>("/tin-operations"),
    fetchJson<TsnIntentWorkItem[]>("/intent-work?limit=100"),
    fetchJson<TsnWorkItem[]>("/work?limit=100"),
    operator
      ? fetchJson<TsnRecoveryWorkItem[]>(
          `/recovery-work?operator_pubkey=${encodeURIComponent(operator)}&limit=100`,
        )
      : Promise.resolve([]),
    fetchJson<TsnTinOperationRecord[]>(
      "/tin-operations/verification-work?limit=100",
    ),
    operator
      ? fetchJson<TsnTinOperationRecord[]>(
          `/tin-operations/fee-work?operator_pubkey=${encodeURIComponent(operator)}&limit=100`,
        )
      : Promise.resolve([]),
    operator
      ? fetchJson<TsnTinOperationRecord[]>(
          `/tin-operations/registry-work?operator_pubkey=${encodeURIComponent(operator)}&limit=100`,
        )
      : Promise.resolve([]),
  ]);
  const countByStatus = (items: Array<{ status: string }>) =>
    items.reduce<Record<string, number>>((counts, item) => {
      const displayStatus =
        item.status === "onchain" ? "escrowed" : item.status;
      counts[displayStatus] = (counts[displayStatus] ?? 0) + 1;
      return counts;
    }, {});
  const intentStatuses = countByStatus(intents);
  const claimStatuses = countByStatus(claims);
  const recoveryStatuses = countByStatus(recoveries);
  const tinStatuses = countByStatus(tinOperations);
  const signature = JSON.stringify({
    intents: intentStatuses,
    claims: claimStatuses,
    recoveries: recoveryStatuses,
    tinOperations: tinStatuses,
    intentWork: intentWork.length,
    claimWork: claimWork.length,
    recoveryWork: recoveryWork.length,
    tinVerificationWork: tinVerificationWork.length,
    tinFeeWork: tinFeeWork.length,
    tinRegistryWork: tinRegistryWork.length,
  });

  return {
    signature,
    line: `intents=${intents.length} ${JSON.stringify(intentStatuses)} claims=${claims.length} ${JSON.stringify(claimStatuses)} recoveries=${recoveries.length} ${JSON.stringify(recoveryStatuses)} tinOps=${tinOperations.length} ${JSON.stringify(tinStatuses)} intentWork=${intentWork.length} claimWork=${claimWork.length} recoveryWork=${recoveryWork.length} tinVerify=${tinVerificationWork.length} tinFee=${tinFeeWork.length} tinRegistry=${tinRegistryWork.length}`,
  };
}

function loadOperatorKeypair() {
  const rawSecret = process.env.TSN_CRANKER_OPERATOR_SECRET_KEY?.trim();
  if (rawSecret) {
    const parsed = JSON.parse(rawSecret) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }

  const keypairPath =
    process.env.TSN_CRANKER_KEYPAIR_PATH ?? process.env.KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error(
      "Set TSN_CRANKER_KEYPAIR_PATH or TSN_CRANKER_OPERATOR_SECRET_KEY for real cranker execution",
    );
  }

  const parsed = JSON.parse(readFileSync(keypairPath, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}


function hex32(value: string, label: string) {
  const buffer = Buffer.from(value, "hex");
  if (buffer.length !== 32)
    throw new Error(`${label} must be a 32-byte hex string`);
  return buffer;
}

function toBaseUnits(amountUi: number | string, decimals: number) {
  const raw = String(amountUi);
  const [whole, fraction = ""] = raw.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return (
    BigInt(whole || "0") * 10n ** BigInt(decimals) +
    BigInt(paddedFraction || "0")
  );
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

function isRecoveryLeaseStillActive(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const transactionLogs =
    error && typeof error === "object" && "transactionLogs" in error
      ? (error as { transactionLogs?: unknown }).transactionLogs
      : null;
  const logs = Array.isArray(transactionLogs) ? transactionLogs.join("\n") : "";
  return (
    message.includes("RecoveryLeaseStillActive") ||
    message.includes("0x1790") ||
    logs.includes("RecoveryLeaseStillActive") ||
    logs.includes("Recovery lease is still active")
  );
}

function recoveryErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const transactionLogs =
    error && typeof error === "object" && "transactionLogs" in error
      ? (error as { transactionLogs?: unknown }).transactionLogs
      : null;
  const logs = Array.isArray(transactionLogs)
    ? transactionLogs.join(" | ")
    : "";
  return logs ? `${message} | ${logs}` : message;
}

function isBlockhashNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const transactionMessage =
    error && typeof error === "object" && "transactionMessage" in error
      ? String(
          (error as { transactionMessage?: unknown }).transactionMessage ?? "",
        )
      : "";
  const transactionLogs =
    error && typeof error === "object" && "transactionLogs" in error
      ? (error as { transactionLogs?: unknown }).transactionLogs
      : null;
  const logs = Array.isArray(transactionLogs) ? transactionLogs.join("\n") : "";
  return (
    message.includes("Blockhash not found") ||
    transactionMessage.includes("Blockhash not found") ||
    logs.includes("Blockhash not found")
  );
}

function isQuarantinedRecoveryReason(reason: string | null | undefined) {
  if (!reason) return false;
  return (
    reason.includes("Access violation") ||
    reason.includes("Program failed to complete")
  );
}

function isPermanentPruSpendPermitFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("TSN permit request failed (409)") ||
    message.includes("TSN permit request failed (422)")
  );
}

function isExpiredPermitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Settlement authorization has expired") ||
    message.includes("permit request failed (409)")
  );
}

function recoveryWorkId(item: TsnRecoveryWorkItem): string {
  return item.id ?? item.paymentId ?? item.transferId ?? "unknown";
}

type RecoveryPermitInfo = {
  expiresAtTs: number;
  issuedAt: number;
};

function getPermitExpiryFromError(error: unknown): number | null {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/expires(?:At|Ts)?[:\s]+(\d+)/i);
    if (match) return parseInt(match[1], 10);
  } catch {
    // ignore
  }
  return null;
}

function getRecipientAmountUi(item: TsnWorkItem) {
  const maybeRecipientAmount = Number(
    (item.intent as TsnWorkItem["intent"] & { recipientAmount?: number })
      .recipientAmount,
  );
  if (
    Number.isFinite(maybeRecipientAmount) &&
    maybeRecipientAmount > 0 &&
    maybeRecipientAmount <= Number(item.intent.amount)
  ) {
    return maybeRecipientAmount;
  }

  return Number(item.intent.amount);
}

function parseAuthorizationMessage(message: string) {
  if (message.startsWith("TSN PRU Spend\n")) {
    const parsed = parsePruSpendMessage(message);
    return {
      action: "zk_pru_only_v2",
      amountBaseUnits: parsed.amountBaseUnits,
      recipientTin: parsed.recipientTin,
      senderFeeBaseUnits: parsed.feeBaseUnits,
      nonce: parsed.nonce,
      expiresAt: parsed.expires.toISOString(),
    };
  }
  if (message.startsWith("TSN Payment Intent\n")) {
    const parsed = parsePaymentIntentMessage(message);
    return {
      action: "payment_intent",
      amountBaseUnits: parsed.amountBaseUnits,
      recipientTin: parsed.recipientTin,
      senderFeeBaseUnits: parsed.feeBaseUnits,
      nonce: parsed.nonce,
      expiresAt: parsed.expires.toISOString(),
    };
  }
  if (message.startsWith("TSN Mixed Payment\n")) {
    const parsed = parseMixedPaymentMessage(message);
    return {
      action: "mixed_zk_pru_wallet_v2",
      amountBaseUnits: parsed.amountBaseUnits,
      recipientTin: parsed.recipientTin,
      senderFeeBaseUnits: parsed.feeBaseUnits,
      pruPortionBaseUnits: parsed.pruPortionBaseUnits,
      walletTopUpPortionBaseUnits: parsed.walletTopUpPortionBaseUnits,
      nonce: parsed.nonce,
      expiresAt: parsed.expires.toISOString(),
    };
  }
  throw new Error("sender authorization message is not canonical TSN text");
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
    walletTopUpAmountBaseUnits?: string | null;
    walletTopUpSenderFeeBaseUnits?: string | null;
    privacyVersion?: number | null;
    commitmentRecord?: string | null;
    transferId?: string | null;
    commitmentHash?: string | null;
  };
  if (!intent.senderSignedSettlementTransaction)
    return "missing sender co-signed settlement transaction";

  const transaction = Transaction.from(
    Buffer.from(intent.senderSignedSettlementTransaction, "base64"),
  );
  if (!transaction.feePayer?.equals(params.operator)) {
    return `settlement transaction fee payer mismatch; expected ${params.operator.toBase58()}, got ${transaction.feePayer?.toBase58() ?? "missing"}`;
  }

  const senderWallet = new PublicKey(intent.senderWallet ?? "");
  const tokenMint = new PublicKey(params.item.intent.tokenMintAddress);
  const expectedAmount =
      intent.senderSettlementMode === "mixed_zk_pru_wallet_v2"
      ? BigInt(intent.walletTopUpAmountBaseUnits ?? "0")
      : toBaseUnits(params.item.intent.amount, params.tokenDecimals);
  const expectedSenderFeeAmount =
      intent.senderSettlementMode === "mixed_zk_pru_wallet_v2"
      ? BigInt(intent.walletTopUpSenderFeeBaseUnits ?? "0")
      : toBaseUnits(
          Number(
            (
              params.item.intent as TsnIntentWorkItem["intent"] & {
                senderFeeAmount?: number | null;
              }
            ).senderFeeAmount ?? 0,
          ),
          params.tokenDecimals,
        );
  const expectedProgramId = new PublicKey(VERIFIED_TSN_PROGRAM_ID);
  const expectedPaymentIntentId = BigInt(
    intent.settlementPaymentIntentId ?? "0",
  );
  const expectedSenderTokenAccount = intent.senderTokenAccount
    ? new PublicKey(intent.senderTokenAccount)
    : null;
  const expectedSettlementVault = intent.settlementVault
    ? new PublicKey(intent.settlementVault)
    : null;
  const expectedSettlementTokenAccount = intent.settlementTokenAccount
    ? new PublicKey(intent.settlementTokenAccount)
    : null;
  const expectedTransferId = intent.transferId
    ? hex32(intent.transferId, "transferId")
    : null;
  const expectedCommitmentHash = intent.commitmentHash
    ? hex32(intent.commitmentHash, "commitmentHash")
    : null;
  const expectedTreasuryTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    getTsnTreasuryPda(),
    true,
  );
  const senderSignature = transaction.signatures.find((entry) =>
    entry.publicKey.equals(senderWallet),
  );
  if (!senderSignature?.signature) {
    return "settlement transaction is not signed by the sender wallet";
  }
  const usesPrivateSettlement =
    Number(intent.privacyVersion ?? 1) >= 2 ||
    intent.senderSettlementMode === "zk_pru_only_v1";
  if (usesPrivateSettlement) {
    const coreInstructions = transaction.instructions.filter(
      (instruction) =>
        !instruction.programId.equals(ComputeBudgetProgram.programId),
    );
    const registerCommitmentRequired = expectedAmount > 0n;
    const expectedCoreInstructionCount =
      (registerCommitmentRequired ? 1 : 0) +
      (expectedSenderFeeAmount > 0n ? 1 : 0);
    if (coreInstructions.length !== expectedCoreInstructionCount) {
      return `private settlement transaction must contain ${expectedCoreInstructionCount} core instructions, got ${coreInstructions.length}`;
    }
    const registerCommitmentIx = registerCommitmentRequired
      ? coreInstructions[0]
      : null;
    const senderFeeTransferIx = registerCommitmentRequired
      ? coreInstructions[1]
      : coreInstructions[0];
    if (
      registerCommitmentRequired &&
      !registerCommitmentIx?.programId.equals(expectedProgramId)
    ) {
      return "private settlement first instruction is not TSN commitment registration";
    }
    if (
      senderFeeTransferIx &&
      !senderFeeTransferIx.programId.equals(TOKEN_PROGRAM_ID)
    ) {
      return "private settlement sender-fee instruction is not SPL Token transfer_checked";
    }

    const escrowTokenAccount = expectedSettlementTokenAccount;
    if (
      !expectedSenderTokenAccount ||
      (registerCommitmentRequired &&
        (!escrowTokenAccount || !expectedCommitmentHash))
    ) {
      return "private settlement is missing sender, escrow, or commitment metadata";
    }
    const sharedEscrowAuthority = getTsnSharedEscrowAuthorityPda();
    if (registerCommitmentRequired) {
      const escrowSignature = transaction.signatures.find((entry) =>
        entry.publicKey.equals(escrowTokenAccount!),
      );
      if (!escrowSignature?.signature) {
        return "private escrow token account did not sign its verifier-funded creation";
      }
      if (
        expectedSettlementVault &&
        !expectedSettlementVault.equals(escrowTokenAccount!)
      ) {
        return "private settlement vault metadata mismatch";
      }
      if (
        registerCommitmentIx!.data.length !== 48 ||
        !bufferEquals(
          registerCommitmentIx!.data.subarray(0, 8),
          instructionDiscriminator("tsn_register_private_commitment"),
        )
      ) {
        return "private commitment instruction data mismatch";
      }
      if (!registerCommitmentIx!.keys[0]?.pubkey.equals(params.operator)) {
        return "private commitment cranker signer mismatch";
      }
      if (!registerCommitmentIx!.keys[1]?.pubkey.equals(senderWallet)) {
        return "private commitment sender signer mismatch";
      }
      if (
        !registerCommitmentIx!.keys[4]?.pubkey.equals(
          expectedSenderTokenAccount,
        )
      ) {
        return "private commitment sender token account mismatch";
      }
      if (!registerCommitmentIx!.keys[5]?.pubkey.equals(tokenMint)) {
        return "private commitment token mint mismatch";
      }
      if (
        !registerCommitmentIx!.keys[6]?.pubkey.equals(sharedEscrowAuthority)
      ) {
        return "private commitment shared escrow authority mismatch";
      }
      if (!registerCommitmentIx!.keys[7]?.pubkey.equals(escrowTokenAccount!)) {
        return "private commitment escrow token account mismatch";
      }
      if (!registerCommitmentIx!.keys[8]?.pubkey.equals(getTsnVerifierPda())) {
        return "private commitment verifier PDA mismatch";
      }
      if (!registerCommitmentIx!.keys[9]?.pubkey.equals(TOKEN_PROGRAM_ID)) {
        return "private commitment token program mismatch";
      }
      if (
        !registerCommitmentIx!.keys[10]?.pubkey.equals(SystemProgram.programId)
      ) {
        return "private commitment system program mismatch";
      }
      if (
        !bufferEquals(
          registerCommitmentIx!.data.subarray(8, 40),
          expectedCommitmentHash!,
        )
      ) {
        return "private commitment hash mismatch";
      }
      if (
        !bufferEquals(
          registerCommitmentIx!.data.subarray(40, 48),
          encodeU64(expectedAmount),
        )
      ) {
        return "private commitment amount mismatch";
      }
    }
    if (senderFeeTransferIx) {
      if (
        senderFeeTransferIx.data.length !== 10 ||
        senderFeeTransferIx.data[0] !== 12 ||
        senderFeeTransferIx.data.readBigUInt64LE(1) !== expectedSenderFeeAmount
      ) {
        return "private settlement sender-fee transfer mismatch";
      }
      if (
        !senderFeeTransferIx.keys[2]?.pubkey.equals(
          expectedTreasuryTokenAccount,
        )
      ) {
        return "private settlement sender fee must route to TSN treasury";
      }
    }
    return null;
  }

  const unexpectedExtraPrograms = transaction.instructions
    .filter(
      (instruction) =>
        !instruction.programId.equals(ComputeBudgetProgram.programId),
    )
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
    (instruction) =>
      !instruction.programId.equals(ComputeBudgetProgram.programId),
  );
  const expectedCoreInstructionCount = expectedSenderFeeAmount > 0n ? 4 : 3;
  if (coreInstructions.length !== expectedCoreInstructionCount) {
    const programList = transaction.instructions
      .map((instruction) => instruction.programId.toBase58())
      .join(",");
    return `settlement transaction must contain ${expectedCoreInstructionCount} core escrow instructions after compute-budget instructions, got ${coreInstructions.length}; programs=${programList}`;
  }

  const processIntentIx = coreInstructions[0];
  const transferIx = coreInstructions[1];
  const finalizeIntentIx = coreInstructions[2];
  const senderFeeTransferIx =
    expectedSenderFeeAmount > 0n ? coreInstructions[3] : null;
  if (!processIntentIx.programId.equals(expectedProgramId))
    return "first settlement instruction is not TSN tsn_process_payment_intent";
  if (!transferIx.programId.equals(TOKEN_PROGRAM_ID))
    return "second settlement instruction is not SPL Token transfer_checked";
  if (!finalizeIntentIx.programId.equals(expectedProgramId)) {
    return "third settlement instruction is not TSN tsn_finalize_payment_intent";
  }
  if (
    senderFeeTransferIx &&
    !senderFeeTransferIx.programId.equals(TOKEN_PROGRAM_ID)
  ) {
    return "fourth settlement instruction is not SPL Token sender-fee transfer_checked";
  }
  if (processIntentIx.data.length !== 88)
    return "process_payment_intent instruction data length mismatch";
  if (transferIx.data.length !== 10)
    return "SPL Token transfer_checked data length mismatch";
  if (finalizeIntentIx.data.length !== 24)
    return "finalize_payment_intent instruction data length mismatch";
  if (senderFeeTransferIx && senderFeeTransferIx.data.length !== 10)
    return "sender-fee SPL Token transfer_checked data length mismatch";
  if (
    !bufferEquals(
      processIntentIx.data.subarray(0, 8),
      instructionDiscriminator("tsn_process_payment_intent"),
    )
  ) {
    return "invalid tsn_process_payment_intent discriminator";
  }
  if (!processIntentIx.keys[0]?.pubkey.equals(params.operator))
    return "process_payment_intent cranker signer mismatch";
  if (
    expectedSettlementVault &&
    !processIntentIx.keys[4]?.pubkey.equals(expectedSettlementVault)
  ) {
    return "process_payment_intent vault PDA mismatch";
  }
  if (
    expectedSettlementTokenAccount &&
    !processIntentIx.keys[5]?.pubkey.equals(expectedSettlementTokenAccount)
  ) {
    return "process_payment_intent vault token account mismatch";
  }
  if (!processIntentIx.keys[6]?.pubkey.equals(tokenMint))
    return "process_payment_intent mint mismatch";
  if (
    !bufferEquals(
      processIntentIx.data.subarray(8, 16),
      encodeU64(expectedPaymentIntentId),
    )
  ) {
    return "process_payment_intent payment id mismatch";
  }
  if (
    !bufferEquals(
      processIntentIx.data.subarray(16, 24),
      encodeU64(expectedAmount),
    )
  ) {
    return "process_payment_intent amount mismatch";
  }
  if (
    !expectedTransferId ||
    !bufferEquals(processIntentIx.data.subarray(24, 56), expectedTransferId)
  ) {
    return "process_payment_intent transfer id mismatch";
  }
  if (
    !expectedCommitmentHash ||
    !bufferEquals(processIntentIx.data.subarray(56, 88), expectedCommitmentHash)
  ) {
    return "process_payment_intent commitment mismatch";
  }
  if (
    !bufferEquals(
      finalizeIntentIx.data.subarray(0, 8),
      instructionDiscriminator("tsn_finalize_payment_intent"),
    )
  ) {
    return "invalid tsn_finalize_payment_intent discriminator";
  }
  if (!finalizeIntentIx.keys[0]?.pubkey.equals(params.operator)) {
    return "finalize_payment_intent cranker signer mismatch";
  }
  if (
    expectedSettlementVault &&
    !finalizeIntentIx.keys[3]?.pubkey.equals(expectedSettlementVault)
  ) {
    return "finalize_payment_intent vault PDA mismatch";
  }
  if (
    expectedSettlementTokenAccount &&
    !finalizeIntentIx.keys[4]?.pubkey.equals(expectedSettlementTokenAccount)
  ) {
    return "finalize_payment_intent vault token account mismatch";
  }
  if (
    !bufferEquals(
      finalizeIntentIx.data.subarray(8, 16),
      encodeU64(expectedPaymentIntentId),
    )
  ) {
    return "finalize_payment_intent payment id mismatch";
  }
  if (
    !bufferEquals(
      finalizeIntentIx.data.subarray(16, 24),
      encodeU64(expectedAmount),
    )
  ) {
    return "finalize_payment_intent amount mismatch";
  }

  if (transferIx.data[0] !== 12)
    return "SPL Token instruction is not transfer_checked";
  const transferAmount = transferIx.data.readBigUInt64LE(1);
  const transferDecimals = transferIx.data[9];
  if (transferAmount !== expectedAmount)
    return "SPL Token transfer amount mismatch";
  if (transferDecimals !== params.tokenDecimals)
    return "SPL Token transfer decimals mismatch";
  if (
    expectedSenderTokenAccount &&
    !transferIx.keys[0]?.pubkey.equals(expectedSenderTokenAccount)
  ) {
    return "SPL Token source account mismatch";
  }
  if (!transferIx.keys[1]?.pubkey.equals(tokenMint))
    return "SPL Token mint mismatch";
  if (
    expectedSettlementTokenAccount &&
    !transferIx.keys[2]?.pubkey.equals(expectedSettlementTokenAccount)
  ) {
    return "SPL Token destination account mismatch";
  }
  if (!transferIx.keys[3]?.pubkey.equals(senderWallet))
    return "SPL Token owner signer mismatch";

  if (senderFeeTransferIx) {
    if (senderFeeTransferIx.data[0] !== 12)
      return "sender-fee SPL Token instruction is not transfer_checked";
    const senderFeeTransferAmount = senderFeeTransferIx.data.readBigUInt64LE(1);
    const senderFeeTransferDecimals = senderFeeTransferIx.data[9];
    if (senderFeeTransferAmount !== expectedSenderFeeAmount)
      return "sender-fee SPL Token transfer amount mismatch";
    if (senderFeeTransferDecimals !== params.tokenDecimals)
      return "sender-fee SPL Token transfer decimals mismatch";
    if (
      expectedSenderTokenAccount &&
      !senderFeeTransferIx.keys[0]?.pubkey.equals(expectedSenderTokenAccount)
    ) {
      return "sender-fee SPL Token source account mismatch";
    }
    if (!senderFeeTransferIx.keys[1]?.pubkey.equals(tokenMint))
      return "sender-fee SPL Token mint mismatch";
    if (
      !senderFeeTransferIx.keys[2]?.pubkey.equals(expectedTreasuryTokenAccount)
    ) {
      return "sender-fee SPL Token destination must be TSN treasury token account";
    }
    if (!senderFeeTransferIx.keys[3]?.pubkey.equals(senderWallet))
      return "sender-fee SPL Token owner signer mismatch";
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
  };
  const expectedIntentSeedHash = createHash("sha256")
    .update(item.intent.paymentId)
    .digest("hex");
  if (item.intent.intentSeedHash !== expectedIntentSeedHash) {
    return `intentSeedHash mismatch for paymentId=${item.intent.paymentId}`;
  }
  if (
    !Number.isFinite(Number(item.intent.amount)) ||
    Number(item.intent.amount) <= 0
  ) {
    return "intent amount must be greater than zero";
  }
  try {
    hex32(item.intent.recipientHash, "recipientHash");
    new PublicKey(item.intent.tokenMintAddress);
    new PublicKey(item.intent.underlyingPayment ?? "");
    new PublicKey(intent.senderWallet ?? "");
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "intent contains invalid public key or hash";
  }
  if (
    !intent.senderWallet ||
    !intent.senderAuthorizationMessage ||
    !intent.senderAuthorizationSignature
  ) {
    return "missing sender payment authorization";
  }
  if (
    intent.senderSettlementMode !== "wallet_only_v2" &&
    intent.senderSettlementMode !== "zk_pru_only_v2" &&
    intent.senderSettlementMode !== "mixed_zk_pru_wallet_v2"
  ) {
    return "unsupported sender settlement mode";
  }
  if (!intent.senderSignedSettlementTransaction) {
    return "missing sender co-signed settlement transaction";
  }
  if (
    !intent.encryptedSettlementToken ||
    !intent.transferId ||
    !intent.commitmentHash
  ) {
    return "missing encrypted settlement token or public commitment";
  }
  if (
    intent.encryptedSettlementToken.transferId !== intent.transferId ||
    intent.encryptedSettlementToken.commitmentHash !== intent.commitmentHash
  ) {
    return "encrypted settlement token metadata does not match public commitment";
  }
  if (
    intent.settlementEpoch == null ||
    intent.encryptedSettlementToken.epoch !== intent.settlementEpoch
  ) {
    return "encrypted settlement token epoch mismatch";
  }
  if (intent.senderSettlementMode === "mixed_zk_pru_wallet_v2") {
    if (!intent.pruSpendTin || !intent.pruSpendSelections?.length) {
      return "mixed funding is missing PRU route selection";
    }
    if (
      BigInt(intent.walletTopUpAmountBaseUnits ?? "0") <= 0n &&
      BigInt(intent.walletTopUpSenderFeeBaseUnits ?? "0") <= 0n
    ) {
      return "mixed funding is missing wallet top-up amounts";
    }
  } else if (!intent.senderSignedSettlementFeePayer) {
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
  let authorization: ReturnType<typeof parseAuthorizationMessage>;
  try {
    authorization = parseAuthorizationMessage(
      intent.senderAuthorizationMessage,
    );
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "sender authorization message is not canonical TSN text";
  }
  const authorizedAmount = Number(authorization.amountBaseUnits) / 1_000_000;
  const authorizedSenderFeeAmount =
    Number(authorization.senderFeeBaseUnits) / 1_000_000;
  if (authorization.recipientTin !== (intent.recipientTin ?? null)) {
    return "sender authorization recipient TIN mismatch";
  }
  if (
    authorization.action === "zk_pru_only_v2" &&
    intent.senderSettlementMode !== "zk_pru_only_v2"
  ) {
    return "sender authorization action does not match settlement mode";
  }
  if (
    authorization.action === "payment_intent" &&
    intent.senderSettlementMode === "zk_pru_only_v2"
  ) {
    return "sender authorization action does not match PRU spend mode";
  }
  if (
    authorization.action === "mixed_zk_pru_wallet_v2" &&
    intent.senderSettlementMode !== "mixed_zk_pru_wallet_v2"
  ) {
    return "sender authorization action does not match mixed funding mode";
  }
  if (
    authorization.action !== "mixed_zk_pru_wallet_v2" &&
    intent.senderSettlementMode === "mixed_zk_pru_wallet_v2"
  ) {
    return "sender authorization action does not match mixed funding mode";
  }
  if (Math.abs(authorizedAmount - Number(item.intent.amount)) > 0.000001) {
    return "sender authorization amount mismatch";
  }
  if (
    Math.abs(
      authorizedSenderFeeAmount -
        Number(
          (
            item.intent as TsnIntentWorkItem["intent"] & {
              senderFeeAmount?: number | null;
            }
          ).senderFeeAmount ?? 0,
        ),
    ) > 0.000001
  ) {
    return "sender authorization fee mismatch";
  }
  if (authorization.action === "mixed_zk_pru_wallet_v2") {
    const expectedPruPortion =
      BigInt(intent.pruSpendAmountBaseUnits ?? "0") +
      BigInt(intent.pruSpendSenderFeeBaseUnits ?? "0");
    const expectedWalletPortion =
      BigInt(intent.walletTopUpAmountBaseUnits ?? "0") +
      BigInt(intent.walletTopUpSenderFeeBaseUnits ?? "0");
    if (authorization.pruPortionBaseUnits !== expectedPruPortion) {
      return "sender authorization PRU funding portion mismatch";
    }
    if (authorization.walletTopUpPortionBaseUnits !== expectedWalletPortion) {
      return "sender authorization wallet top-up portion mismatch";
    }
  }
  if (authorization.nonce !== intent.senderAuthorizationNonce) {
    return "sender authorization nonce mismatch";
  }
  const authorizationExpiryMs = Date.parse(authorization.expiresAt);
  const intentExpiryMs = Date.parse(intent.senderAuthorizationExpiresAt);
  if (
    !Number.isFinite(authorizationExpiryMs) ||
    !Number.isFinite(intentExpiryMs) ||
    authorizationExpiryMs !== intentExpiryMs
  ) {
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
  mempool: TsnMempool;
  operator: Keypair;
  rpcUrl: string;
  tokenDecimals: number;
}) {
  const sponsoredSettlement = params.item
    .intent as TsnIntentWorkItem["intent"] & {
    senderSignedSettlementTransaction?: string | null;
    senderSignedSettlementFeePayer?: string | null;
    senderSettlementMode?: string | null;
    settlementVault?: string | null;
  };
  if (!sponsoredSettlement.senderSignedSettlementTransaction) {
    throw new Error(
      "Sponsored settlement transaction is required; public PaymentIntent PDA creation is disabled.",
    );
  }

  try {
    const created = await tsnSubmitSenderSignedSettlementTransaction({
      operator: params.operator,
      signedTransactionBase64:
        sponsoredSettlement.senderSignedSettlementTransaction,
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
  } catch (error) {
    if (isBlockhashNotFoundError(error)) {
      await params.mempool
        .updateIntentStatus(params.item.intent.id, "expired", {
          source: params.item.intent.source,
          assignedCrankerPubkey: params.operator.publicKey.toBase58(),
          settlementResolution: "reverted",
          settlementReason:
            "Sender-signed settlement transaction expired before the cranker could submit it. A fresh authorization is required.",
        } as Partial<TsnIntentWorkItem["intent"]>)
        .catch(() => undefined);
      throw new Error(
        "Sender-signed settlement transaction expired before submission; request a fresh authorization.",
      );
    }
    throw error;
  }
}

/* Legacy mempool claim/recovery executors were removed. Receiver work is
 * authorized by TSN Node and handled by processReceiverClaim/Recovery. */
/* async function executeClaimWork(params: {
  item: TsnWorkItem;
  mempool: ReturnType<typeof createMempoolClient>;
  operator: Keypair;
  crankerEncryptionSecretKey: string | null;
  rpcUrl: string;
  tokenDecimals: number;
}) {
  const intent = params.item.intent as TsnWorkItem["intent"] & {
    encryptedSettlementToken?:
      | Parameters<typeof decryptSettlementToken>[0]["encrypted"]
      | null;
    settlementPaymentIntentId?: string | null;
    transferId?: string | null;
    commitmentHash?: string | null;
    settlementEpoch?: number | null;
    privacyVersion?: number | null;
    settlementTokenAccount?: string | null;
  };
  if (Number(intent.privacyVersion ?? 1) >= 2) {
    const receiver = receiverUrl();
    if (!receiver) {
      throw new Error("TSN_RECEIVER_URL is required for private payout permits");
    }
    const permit = await REMOVED_LEGACY_REQUEST_PAYOUT({
      mempoolUrl: receiver,
      apiKey: process.env.TSN_MEMPOOL_API_KEY,
      claimRequestId: params.item.claimRequest.id,
      operator: params.operator,
    });
    const payoutNullifier = hex32(permit.payoutNullifier, "payoutNullifier");
    const payout = await tsnExecutePrivatePayoutOnChain({
      operator: params.operator,
      permitSigner: new PublicKey(permit.permitSigner),
      permitSignature: Uint8Array.from(
        Buffer.from(permit.permitSignatureBase64, "base64"),
      ),
      payoutNullifier,
      payoutSequence: BigInt(permit.payoutSequence),
      tokenMint: new PublicKey(permit.tokenMintAddress),
      recipientWallet: new PublicKey(permit.recipientWallet),
      payoutAmount: BigInt(permit.payoutAmountBaseUnits),
      claimFeeAmount: BigInt(permit.claimFeeAmountBaseUnits),
      expiresAtTs: BigInt(permit.expiresAtTs),
      rpcUrl: params.rpcUrl,
    });
    return {
      intent: params.item.intent.id,
      proofSignature: payout.signature,
      otdtHash: permit.payoutNullifier,
      commitmentHash: null,
      transferId: null,
    };
  }

  if (
    !intent.encryptedSettlementToken ||
    !intent.settlementPaymentIntentId ||
    !params.crankerEncryptionSecretKey
  ) {
    throw new Error(
      "Legacy intent is missing its encrypted route, payment vault id, or legacy decryption key",
    );
  }
  const settlementToken = decryptSettlementToken({
    encrypted: intent.encryptedSettlementToken,
    crankerEncryptionSecretKey: params.crankerEncryptionSecretKey,
  });
  if (settlementToken.paymentId !== intent.paymentId) {
    throw new Error("Decrypted settlement token payment id mismatch");
  }
  if (settlementToken.transferId !== intent.transferId) {
    throw new Error("Decrypted settlement token transfer id mismatch");
  }
  if (settlementToken.epoch !== intent.settlementEpoch) {
    throw new Error("Decrypted settlement token epoch mismatch");
  }
  if (Date.parse(settlementToken.expiresAt) <= Date.now()) {
    throw new Error("Encrypted settlement token has expired");
  }
  if (settlementToken.tokenMintAddress !== intent.tokenMintAddress) {
    throw new Error("Decrypted settlement token mint mismatch");
  }

  const tokenMint = new PublicKey(settlementToken.tokenMintAddress);
  const recipientWallet = new PublicKey(settlementToken.recipientWallet);
  const payoutAmountBaseUnits = BigInt(
    settlementToken.recipientAmountBaseUnits,
  );
  const claimFeeAmountBaseUnits = BigInt(
    settlementToken.claimFeeAmountBaseUnits,
  );
  const paymentIntentId = BigInt(intent.settlementPaymentIntentId);
  const otdt = createOneTimeDecryptionToken();
  await tsnClaimVaultSettlementOnChain({
    operator: params.operator,
    paymentIntentId,
    otdtHash32: hex32(otdt.hash, "otdtHash"),
    rpcUrl: params.rpcUrl,
  });
  const payout = await tsnExecuteVaultPayoutOnChain({
    operator: params.operator,
    paymentIntentId,
    tokenMint,
    recipientWallet,
    payoutAmountBaseUnits,
    claimFeeAmountBaseUnits,
    otdt: otdt.token,
    decryptionSecret: decodeSettlementSecret(settlementToken.decryptionSecret),
    rpcUrl: params.rpcUrl,
  });

  return {
    intent:
      (
        params.item.intent as TsnWorkItem["intent"] & {
          settlementVault?: string | null;
        }
      ).settlementVault ?? params.item.intent.id,
    proofSignature: payout.signature,
    otdtHash: otdt.hash,
    commitmentHash:
      intent.commitmentHash ?? intent.encryptedSettlementToken.commitmentHash,
    transferId: intent.transferId ?? intent.encryptedSettlementToken.transferId,
  };
}

async function executeRecoveryWork(params: {
  item: TsnRecoveryWorkItem;
  operator: Keypair;
  rpcUrl: string;
  tokenDecimals: number;
}) {
  if (Number(params.item.privacyVersion ?? 1) >= 2) {
    const receiver = receiverUrl();
    if (!receiver) {
      throw new Error(
        "TSN_RECEIVER_URL is required for private recovery permits",
      );
    }
    const recoveryId = params.item.id;
    const nowSec = Math.floor(Date.now() / 1000);

    console.log(
      `[tsn-cranker] recovery-permit-request ` +
        `recoveryId=${recoveryId} ` +
        `currentTime=${nowSec} `,
    );

    let permit;
    try {
      permit = await REMOVED_LEGACY_REQUEST_RECOVERY({
        mempoolUrl: receiver,
        apiKey: process.env.TSN_MEMPOOL_API_KEY,
        recoveryId,
        operator: params.operator,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isExpiredPermitError(error)) {
        console.warn(
          `[tsn-cranker] recovery-permit-expired ` +
            `recoveryId=${recoveryId} ` +
            `error="${message}"`,
        );
      }
      throw error;
    }

    const permitExpiresAt = Number(permit.expiresAtTs);
    const permitTtl = permitExpiresAt - nowSec;

    console.log(
      `[tsn-cranker] recovery-permit-granted ` +
        `recoveryId=${recoveryId} ` +
        `expiresAt=${permitExpiresAt} ` +
        `currentTime=${nowSec} ` +
        `ttlSecs=${permitTtl}`,
    );

    if (permitTtl <= 0) {
      throw new Error(
        `Recovery permit already expired (expiresAt=${permitExpiresAt}, currentTime=${nowSec}); ` +
          `request a fresh permit`,
      );
    }

    const onChainExpiresAtTs = BigInt(permit.expiresAtTs);
    return tsnRecoverPrivateEscrowOnChain({
      operator: params.operator,
      permitSigner: new PublicKey(permit.permitSigner),
      permitSignature: Uint8Array.from(
        Buffer.from(permit.permitSignatureBase64, "base64"),
      ),
      recoveryNullifier: hex32(permit.recoveryNullifier, "recoveryNullifier"),
      recoverySequence: BigInt(permit.recoverySequence),
      escrowTokenAccount: new PublicKey(permit.escrowTokenAccount),
      settlementCrankerOperator: new PublicKey(permit.settlementCrankerPubkey),
      tokenMint: new PublicKey(permit.tokenMintAddress),
      recoveryAmount: BigInt(permit.recoveryAmountBaseUnits),
      expiresAtTs: onChainExpiresAtTs,
      rpcUrl: params.rpcUrl,
    });
  }
  const legacyItem = params.item as TsnRecoveryWorkItem & {
    paymentIntentId: string;
    settlementCrankerPubkey: string;
  };
  const paymentIntentId = BigInt(legacyItem.paymentIntentId);
  const tokenMint = new PublicKey(legacyItem.tokenMintAddress);
  const settlementCrankerOperator = new PublicKey(
    legacyItem.settlementCrankerPubkey,
  );
  try {
    await tsnClaimVaultRecoveryOnChain({
      operator: params.operator,
      paymentIntentId,
      rpcUrl: params.rpcUrl,
    });
  } catch (error) {
    if (!isRecoveryLeaseStillActive(error)) throw error;
    console.log(
      `[tsn-cranker] recovery-lease-already-active intent=${params.item.paymentId}; continuing with leased recovery`,
    );
  }
  return tsnRecoverPaymentVaultOnChain({
    operator: params.operator,
    paymentIntentId,
    tokenMint,
    settlementCrankerOperator,
    rpcUrl: params.rpcUrl,
  });
}

*/
async function postHeartbeat(operator: string) {
  const receiver = receiverUrl();
  if (!receiver) return;

  try {
    const response = await fetch(
      `${receiver.replace(/\/$/, "")}/crankers/heartbeat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.TSN_MEMPOOL_API_KEY
            ? { "x-api-key": process.env.TSN_MEMPOOL_API_KEY }
            : {}),
        },
        body: JSON.stringify({
          operator_pubkey: operator,
          cranker_pubkey: process.env.TSN_CRANKER_PDA ?? null,
          version: "reference-cranker",
          source: "tsn-cranker-op-daemon",
        }),
      },
    );

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

  console.log(
    `[tsn-cranker] cranker=${cranker.toBase58()} registered lamports=${account.lamports}`,
  );
  return cranker;
}

async function logVerifierReservoir(rpcUrl: string) {
  const verifierPda = getTsnVerifierPda();
  const connection = new Connection(rpcUrl, "confirmed");
  const balanceLamports = await connection.getBalance(verifierPda, "confirmed");
  console.log(
    `[tsn-cranker] verifierPda=${verifierPda.toBase58()} lamports=${balanceLamports}`,
  );
  if (balanceLamports < 5_000_000) {
    console.warn(
      `[tsn-cranker] verifier-low-balance fund with: npm run tsn:verifier:fund -- <keypairPath> 0.05`,
    );
  }
}

async function assertPrivateReplayRegistryInitialized(rpcUrl: string) {
  const replayRegistry = getTsnPrivateReplayRegistryPda();
  const connection = new Connection(rpcUrl, "confirmed");
  const account = await connection.getAccountInfo(replayRegistry, "confirmed");
  if (!account) {
    throw new Error(
      `TSN private replay registry is not initialized at ${replayRegistry.toBase58()}. Run npm run tsn:private:configure with the Mother Escrow authority before starting the cranker.`,
    );
  }
  console.log(
    `[tsn-cranker] privateReplayRegistry=${replayRegistry.toBase58()}`,
  );
}

function computeLocalEpochAggregate(
  intents: TsnIntentWorkItem["intent"][],
  epoch: number,
) {
  let root = Buffer.alloc(32);
  let totalToDistribute = 0n;
  let crankerCreditSumMod = 0n;
  let commitments = 0;
  for (const intent of intents) {
    if (Number(intent.settlementEpoch ?? 0) !== epoch || !intent.commitmentHash)
      continue;
    const commitmentHash = Buffer.from(intent.commitmentHash, "hex");
    if (commitmentHash.length !== 32) continue;
    const amount = BigInt(Math.trunc(Number(intent.amount ?? 0)));
    const amountBuffer = encodeU64(amount);
    root = createHash("sha256")
      .update(Buffer.from("tsn_epoch_root"))
      .update(root)
      .update(commitmentHash)
      .update(amountBuffer)
      .digest();
    totalToDistribute += amount;
    crankerCreditSumMod = (crankerCreditSumMod + 1n) % 10_000_000_007n;
    commitments += 1;
  }
  return {
    rootHash: root.toString("hex"),
    totalToDistribute,
    crankerCreditSumMod,
    commitments,
  };
}

async function subscribeEpochSettlementAccounts(params: {
  connection: Connection;
  motherEscrow: PublicKey;
}) {
  const programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID);
  const epochAccountDiscriminator = createHash("sha256")
    .update("account:EpochAccount")
    .digest()
    .subarray(0, 8);
  const epochSubscriptionId = params.connection.onProgramAccountChange(
    programId,
    (change, context) => {
      const data = Buffer.from(change.accountInfo.data);
      if (
        data.length < 16 ||
        !data.subarray(0, 8).equals(epochAccountDiscriminator)
      )
        return;
      const accountMotherEscrow = new PublicKey(data.subarray(8, 40));
      if (!accountMotherEscrow.equals(params.motherEscrow)) return;
      const epochId = data.readBigUInt64LE(8 + 32);
      const rootHash = data
        .subarray(8 + 32 + 8 + 32 + 32, 8 + 32 + 8 + 32 + 32 + 32)
        .toString("hex");
      epochRaceCache.set(change.accountId.toBase58(), {
        lastSeenSlot: context.slot,
        lastRootHash: rootHash,
      });
      console.log(
        `[tsn-cranker] epoch-account-update account=${change.accountId.toBase58()} epoch=${epochId} slot=${context.slot}`,
      );
    },
    "confirmed",
  );
  shutdownControllers.push(epochSubscriptionId);

  for (const pea of parsePubkeyList(
    process.env.TSN_ACTIVE_PEA_ADDRESSES ?? process.env.TSN_ACTIVE_PEA_ADDRESS,
  )) {
    const id = params.connection.onAccountChange(
      pea,
      (accountInfo, context) => {
        console.log(
          `[tsn-cranker] pea-update pea=${pea.toBase58()} lamports=${accountInfo.lamports} slot=${context.slot}`,
        );
      },
      "confirmed",
    );
    shutdownControllers.push(id);
  }

  for (const privacyReceive of parsePubkeyList(
    process.env.TSN_PRIVACY_RECEIVE_ADDRESSES,
  )) {
    const id = params.connection.onAccountChange(
      privacyReceive,
      (_accountInfo, context) => {
        console.log(
          `[tsn-cranker] privacy-receive-update pda=${privacyReceive.toBase58()} slot=${context.slot} action=sweep-required`,
        );
      },
      "confirmed",
    );
    shutdownControllers.push(id);
  }

  console.log(
    `[tsn-cranker] subscriptions epochAccounts=on pea=${parsePubkeyList(process.env.TSN_ACTIVE_PEA_ADDRESSES ?? process.env.TSN_ACTIVE_PEA_ADDRESS).length} privacyReceive=${parsePubkeyList(process.env.TSN_PRIVACY_RECEIVE_ADDRESSES).length}`,
  );
}

async function raceEpochChallenges(params: {
  mempool: ReturnType<typeof createMempoolClient>;
  operator: Keypair;
  rpcUrl: string;
  connection: Connection;
}) {
  let challenges;
  try {
    challenges = await params.mempool.listOpenEpochChallenges(10);
  } catch (error) {
    if (isMissingMempoolEndpoint(error)) {
      return;
    }
    throw error;
  }
  const localIntents = await params.mempool.listIntents();
  const priorityFee = await dynamicPriorityFeeMicroLamports(params.connection);
  for (const challenge of challenges) {
    const cacheKey = epochChallengeCacheKey(
      challenge.epoch,
      challenge.rootHash,
    );
    const cached = epochRaceCache.get(cacheKey);
    if (cached?.submittedAt && Date.now() - cached.submittedAt < 30_000)
      continue;
    try {
      if (!/^[0-9a-fA-F]{64}$/.test(challenge.rootHash)) {
        await params.mempool.updateEpochChallengeStatus(
          challenge.id,
          "failed",
          {
            settlementReason:
              "Invalid TSN epoch root hash length; challenge quarantined before Cranker race.",
          },
        );
        continue;
      }

      const localAggregate = computeLocalEpochAggregate(
        localIntents,
        challenge.epoch,
      );
      if (
        localAggregate.commitments > 0 &&
        localAggregate.rootHash !== challenge.rootHash.toLowerCase()
      ) {
        await params.mempool.updateEpochChallengeStatus(
          challenge.id,
          "failed",
          {
            settlementReason: `Local TSN epoch root mismatch; expected ${localAggregate.rootHash} from ${localAggregate.commitments} commitments.`,
          },
        );
        continue;
      }

      const reimbursement = await tsnProcessBatchReimbursementOnChain({
        operator: params.operator,
        epochId: challenge.epoch,
        recomputedRootHash: challenge.rootHash,
        totalToDistribute: challenge.totalToDistribute,
        crankerCreditSumMod: challenge.crankerCreditSumMod,
        rpcUrl: params.rpcUrl,
        computeUnitPriceMicroLamports: priorityFee,
      });
      epochRaceCache.set(cacheKey, {
        lastSeenSlot: cached?.lastSeenSlot ?? 0,
        lastRootHash: challenge.rootHash,
        submittedAt: Date.now(),
      });
      await params.mempool.updateEpochChallengeStatus(
        challenge.id,
        "submitted",
        {
          winnerCrankerPubkey: params.operator.publicKey.toBase58(),
          reimbursementTxSig: reimbursement.signature,
          epochAccount:
            reimbursement.epochAccount ?? challenge.epochAccount ?? null,
          settlementReason:
            "TSN competitive recovery submitted by fastest local Cranker loop.",
        },
      );
      console.log(
        `[tsn-cranker] epoch-race-submitted epoch=${challenge.epoch} challenge=${challenge.id} tx=${reimbursement.signature} winner=${params.operator.publicKey.toBase58()}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await params.mempool
        .updateEpochChallengeStatus(challenge.id, "failed", {
          settlementReason: message,
        })
        .catch(() => undefined);
      console.error(
        `[tsn-cranker] epoch-race-failed epoch=${challenge.epoch} challenge=${challenge.id}`,
        error,
      );
    }
  }
}

function base64Bytes(value: string | null | undefined, label: string) {
  if (!value) throw new Error(`${label} is required`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0) throw new Error(`${label} is empty`);
  return bytes;
}

function tinsProgramId(): PublicKey {
  return process.env.TINS_PROGRAM_ID
    ? new PublicKey(process.env.TINS_PROGRAM_ID)
    : new PublicKey(DEFAULT_TIP_PROGRAM_ID);
}

async function fetchReceiverStatusSummary(): Promise<ReceiverStatusSummary | null> {
  const baseUrl = receiverUrl().replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/work`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GET /api/work failed (${response.status})`);
  const work = await response.json() as Array<{ kind?: string; status?: string }>;
  const counts = work.reduce<Record<string, number>>((result, item) => {
    const key = `${item.kind ?? "UNKNOWN"}:${item.status ?? "UNKNOWN"}`;
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
  const signature = JSON.stringify(counts);
  return { signature, line: `work=${work.length} ${JSON.stringify(counts)}` };
}

async function submitTinRegistryMutation(params: {
  operation: TsnTinOperationRecord;
  operator: Keypair;
  connection: Connection;
}) {
  const programId = tinsProgramId();
  const ownerPubkey = new PublicKey(params.operation.ownerPubkey);
  const identity = getTinsIdentityPda({ walletPubkey: ownerPubkey, programId });
  const intentHash = hex32(params.operation.ownerIntentHash, "ownerIntentHash");
  const ownerIntentMessage = params.operation.ownerIntentMessage?.trim()
    ? Buffer.from(params.operation.ownerIntentMessage, "utf8")
    : intentHash;
  const ownerSignature = base64Bytes(
    params.operation.ownerSignature,
    "ownerSignature",
  );
  const encryptedMasterSeed = base64Bytes(
    params.operation.intentType === "tin_creation"
      ? params.operation.encryptedMasterSeed
      : params.operation.newEncryptedMasterSeed,
    "encryptedMasterSeed",
  );
  const encryptedPublicRouteEnvelope = base64Bytes(
    params.operation.intentType === "tin_creation"
      ? params.operation.encryptedPublicRouteEnvelope
      : params.operation.newEncryptedPublicRouteEnvelope,
    "encryptedPublicRouteEnvelope",
  );
  const routeVersion =
    params.operation.intentType === "tin_creation"
      ? params.operation.routeVersion
      : params.operation.newRouteVersion;
  const routeNonce = hex32(
    (params.operation.intentType === "tin_creation"
      ? params.operation.routeNonce
      : params.operation.newRouteNonce) ?? "",
    "routeNonce",
  );
  const operationNonce = hex32(params.operation.nonce, "nonce");
  const displayName =
    (params.operation.intentType === "tin_creation"
      ? params.operation.displayName
      : params.operation.newDisplayName) ?? "";
  if (!displayName.trim())
    throw new Error("displayName is required for TIP registry mutation");

  const ed25519Ix = createOwnerIntentSignatureInstruction({
    ownerPubkey,
    intentHash,
    message: ownerIntentMessage,
    signature: ownerSignature,
  });

  // A Solana legacy transaction is limited to 1,232 bytes.  The encrypted
  // master-seed and public-route envelopes are intentionally larger than that
  // when a TIN carries its full PRU map, so updates use a program-owned
  // staging PDA.  The Cranker only transports opaque ciphertext; the final
  // owner-authorized instruction commits the exact bytes and closes staging.
  const sendSingleInstruction = async (instruction: TransactionInstruction) => {
    const { blockhash } = await params.connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = params.operator.publicKey;
    transaction.recentBlockhash = blockhash;
    return sendAndConfirmTransaction(
      params.connection,
      transaction,
      [params.operator],
      { commitment: "confirmed" },
    );
  };

  if (params.operation.intentType === "tin_update") {
    const staging = getTinsMutationStagingPda({
      ownerPubkey,
      intentHash,
      programId,
    });
    const encryptedMetadataHash = hex32(
      params.operation.newEncryptedMetadataHash ??
        params.operation.encryptedMetadataHash,
      "encryptedMetadataHash",
    );
    const pruConfigurationHash = hex32(
      params.operation.newPruConfigurationHash ??
        params.operation.pruConfigurationHash,
      "pruConfigurationHash",
    );
    const stageIx = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
        { pubkey: staging, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: serializeTinMutationStageParams({
        ownerPubkey,
        intentHash,
        displayName,
        encryptedMetadataHash,
        pruConfigurationHash,
        routeVersion: routeVersion ?? 0,
        routeNonce,
        nonce: operationNonce,
        expiryTs: params.operation.expiry,
        encryptedMasterSeedLength: encryptedMasterSeed.length,
        encryptedPublicRouteEnvelopeLength: encryptedPublicRouteEnvelope.length,
      }),
    });
    await sendSingleInstruction(stageIx);

    // Keep each write comfortably below the packet limit even after account
    // metadata and signatures are encoded.  Chunk writes are sequential and
    // idempotent on-chain, so a retried Cranker can resume safely.
    const chunkSize = 700;
    const appendChunks = async (
      kind: "master_seed" | "public_route",
      bytes: Buffer,
    ) => {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
        const chunkIx = new TransactionInstruction({
          programId,
          keys: [
            { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
            { pubkey: staging, isSigner: false, isWritable: true },
          ],
          data: serializeTinMutationChunkParams({
            kind,
            offset,
            bytes: chunk,
          }),
        });
        await sendSingleInstruction(chunkIx);
      }
    };
    await appendChunks("master_seed", encryptedMasterSeed);
    await appendChunks("public_route", encryptedPublicRouteEnvelope);

    const finalizeIx = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
        { pubkey: identity, isSigner: false, isWritable: true },
        { pubkey: staging, isSigner: false, isWritable: true },
        {
          pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: serializeTinUpdateStagedParams({ intentHash }),
    });
    const { blockhash } = await params.connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction().add(ed25519Ix, finalizeIx);
    transaction.feePayer = params.operator.publicKey;
    transaction.recentBlockhash = blockhash;
    return sendAndConfirmTransaction(
      params.connection,
      transaction,
      [params.operator],
      { commitment: "confirmed" },
    );
  }

  const mutationData =
    params.operation.intentType === "tin_creation"
      ? serializeTinCreationRegistryParams({
          ownerPubkey,
          displayName,
          encryptedMasterSeed,
          encryptedMetadataHash: hex32(
            params.operation.encryptedMetadataHash,
            "encryptedMetadataHash",
          ),
          pruConfigurationHash: hex32(
            params.operation.pruConfigurationHash,
            "pruConfigurationHash",
          ),
          encryptedPublicRouteEnvelope,
          routeVersion: routeVersion ?? 0,
          routeNonce,
          nonce: operationNonce,
          intentHash,
          expiryTs: params.operation.expiry,
        })
      : serializeTinUpdateParams({
          ownerPubkey,
          displayName,
          encryptedMasterSeed,
          encryptedMetadataHash: hex32(
            params.operation.newEncryptedMetadataHash ??
              params.operation.encryptedMetadataHash,
            "encryptedMetadataHash",
          ),
          pruConfigurationHash: hex32(
            params.operation.newPruConfigurationHash ??
              params.operation.pruConfigurationHash,
            "pruConfigurationHash",
          ),
          encryptedPublicRouteEnvelope,
          routeVersion: routeVersion ?? 0,
          routeNonce,
          nonce: operationNonce,
          intentHash,
          expiryTs: params.operation.expiry,
        });

  const keys =
    params.operation.intentType === "tin_creation"
      ? [
          {
            pubkey: params.operator.publicKey,
            isSigner: true,
            isWritable: true,
          },
          {
            pubkey: getTinsGlobalStatePda(programId),
            isSigner: false,
            isWritable: true,
          },
          { pubkey: identity, isSigner: false, isWritable: true },
          {
            pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ]
      : [
          {
            pubkey: params.operator.publicKey,
            isSigner: true,
            isWritable: true,
          },
          { pubkey: identity, isSigner: false, isWritable: true },
          {
            pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ];
  const mutationIx = new TransactionInstruction({
    programId:
      typeof programId === "string" ? new PublicKey(programId) : programId,
    keys,
    data: mutationData,
  });

  const { blockhash } = await params.connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction().add(ed25519Ix, mutationIx);
  transaction.feePayer = params.operator.publicKey;
  transaction.recentBlockhash = blockhash;
  const signature = await sendAndConfirmTransaction(
    params.connection,
    transaction,
    [params.operator],
    { commitment: "confirmed" },
  );
  return signature;
}

async function processTinOperationWork(params: {
  mempool: ReturnType<typeof createMempoolClient>;
  operator: Keypair;
  connection: Connection;
}) {
  const operatorPubkey = params.operator.publicKey.toBase58();

  for (const operation of await params.mempool.listTinVerificationWork(10)) {
    try {
      await params.mempool.markTinOperationVerified(
        operation.intentId,
        operatorPubkey,
      );
      console.log(
        `[tsn-cranker] tins.verified intent=${operation.intentId} tin=${operation.tin} verifier=${operatorPubkey}`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await params.mempool
        .markTinOperationFailed(operation.intentId, reason)
        .catch(() => undefined);
      console.error(
        `[tsn-cranker] tins.verify_failed intent=${operation.intentId}`,
        error,
      );
    }
  }

  for (const operation of await params.mempool.listTinFeeWork(
    operatorPubkey,
    10,
  )) {
    try {
      await params.mempool.markTinOperationFeeCommitted(
        operation.intentId,
        operatorPubkey,
        null,
      );
      console.log(
        `[tsn-cranker] tins.fee_committed intent=${operation.intentId} tin=${operation.tin} submitter=${operatorPubkey}`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await params.mempool
        .markTinOperationFailed(operation.intentId, reason)
        .catch(() => undefined);
      console.error(
        `[tsn-cranker] tins.fee_failed intent=${operation.intentId}`,
        error,
      );
    }
  }

  for (const operation of await params.mempool.listTinRegistryWork(
    operatorPubkey,
    5,
  )) {
    if (
      operation.submitterCranker &&
      operation.submitterCranker !== operatorPubkey
    )
      continue;
    try {
      const signature = await submitTinRegistryMutation({
        operation,
        operator: params.operator,
        connection: params.connection,
      });
      await params.mempool.markTinOperationSubmitted(
        operation.intentId,
        operatorPubkey,
        signature,
      );
      await params.mempool.markTinOperationFinalized(
        operation.intentId,
        signature,
      );
      console.log(
        `[tsn-cranker] tins.finalized intent=${operation.intentId} tin=${operation.tin} tx=${signature}`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await params.mempool
        .markTinOperationFailed(operation.intentId, reason)
        .catch(() => undefined);
      console.error(
        `[tsn-cranker] tins.submit_failed intent=${operation.intentId}`,
        error,
      );
    }
  }
}

const tracedRaceEpochChallenges = traceFunction(raceEpochChallenges, {
  namespace: "Cranker",
  name: "raceEpochChallenges",
  module: "tsn-cranker-op-daemon/scripts/cranker.ts",
  level: "debug",
  includeReturn: false,
});

const tracedProcessTinOperationWork = traceFunction(processTinOperationWork, {
  namespace: "Cranker",
  name: "processTinOperationWork",
  module: "tsn-cranker-op-daemon/scripts/cranker.ts",
  level: "debug",
  includeReturn: false,
});

const tracedSubmitIntentOnChainWork = traceFunction(submitIntentOnChainWork, {
  namespace: "Cranker",
  name: "submitIntentOnChainWork",
  module: "tsn-cranker-op-daemon/scripts/cranker.ts",
  level: "info",
  includeReturn: false,
});

async function main() {
  if (!receiverUrl()) {
    throw new Error("TSN_RECEIVER_URL is required; legacy direct mempool settlement is disabled");
  }
  const mempool = createMempoolClient();
  const operatorKeypair = loadOperatorKeypair();
  const operator = operatorKeypair.publicKey.toBase58();
  assertReceiverCredential(operator);
  process.env.TSN_CRANKER_OPERATOR_PUBKEY = operator;
  if (
    process.env.TSN_CRANKER_OPERATOR_PUBKEY &&
    process.env.TSN_CRANKER_OPERATOR_PUBKEY !== operator
  ) {
    console.warn(
      `[tsn-cranker] ignoring TSN_CRANKER_OPERATOR_PUBKEY=${process.env.TSN_CRANKER_OPERATOR_PUBKEY}; using signer keypair ${operator}`,
    );
  }
  const rpcUrl = resolveSolanaRpcUrl({ frontendSafe: false });
  const websocketEnabled = process.env.TSN_ENABLE_SOLANA_SUBSCRIPTIONS === "true";
  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
    wsEndpoint: websocketEnabled ? process.env.SOLANA_WS_URL : undefined,
  });
  const tokenDecimals = Number(process.env.TSN_CRANKER_TOKEN_DECIMALS ?? 6);
  installShutdownHandlers();

  console.log(`[tsn-cranker] operator=${operator}`);
  console.log("[tsn-cranker] source=tsn-receiver");
  console.log("[tsn-cranker] execution=real-onchain");
  console.log(`[tsn-cranker] receiver=${safeHost(receiverUrl())}`);
  console.log(`[tsn-cranker] rpc=${safeHost(rpcUrl)}`);

  const motherEscrowState = await tsnFetchMotherEscrowOnChain(rpcUrl);
  if (!motherEscrowState || !motherEscrowState.valid) {
    const reason =
      motherEscrowState && "reason" in motherEscrowState
        ? motherEscrowState.reason
        : "missing";
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
  await assertPrivateReplayRegistryInitialized(rpcUrl);
  const motherEscrow = new PublicKey(motherEscrowState.address);
  await assertCrankerRegistered({
    operator: operatorKeypair.publicKey,
    motherEscrow,
    rpcUrl,
  });
  if (shouldUseAccountSubscriptions(rpcUrl)) {
    await subscribeEpochSettlementAccounts({ connection, motherEscrow });
  } else {
    console.log(
      "[tsn-cranker] subscriptions disabled; set SOLANA_WS_URL to enable websocket account monitoring",
    );
  }

  let lastMempoolOverviewSignature = "";
  let lastReceiverStatusSignature = "";
  const receiverBasePollMs = Math.max(500, Number(process.env.TSN_CRANKER_POLL_MS ?? 2000));
  const claimRetryAfter = new Map<string, number>();
  const logMempoolOverview = async (reason: string) => {
    try {
      const overview = await fetchMempoolOverview();
      if (!overview) return;
      if (
        overview.signature !== lastMempoolOverviewSignature ||
        reason === "startup"
      ) {
        lastMempoolOverviewSignature = overview.signature;
        console.log(`[tsn-cranker] mempool.${reason} ${overview.line}`);
      }
    } catch (error) {
      console.warn("[tsn-cranker] mempool.status_failed", error);
    }
  };
  // Receiver is the authoritative work source; the legacy mempool overview
  // endpoints are intentionally not queried.

  while (!shuttingDown) {
    try {
      if (process.env.TSN_RECEIVER_URL) {
        const leased = await receiverRequest<{ work: ReceiverWork | null }>("POST", {
          crankerId: operator,
          supportedKinds: ["PAYMENT_INTENT", "CLAIM", "RECOVERY"],
        });
        if (!leased.work) {
          try {
            const status = await fetchReceiverStatusSummary();
            if (status && status.signature !== lastReceiverStatusSignature) {
              lastReceiverStatusSignature = status.signature;
              console.log(`[tsn-cranker] receiver.status ${status.line}`);
            }
          } catch (error) {
            console.warn("[tsn-cranker] receiver.status_failed", error);
          }
          console.log("[tsn-cranker] receiver.poll no-eligible-work");
        }
        if (leased.work) {
          try {
            if (leased.work.kind === "PAYMENT_INTENT") {
              await processReceiverPaymentIntent({ work: leased.work, operator: operatorKeypair, rpcUrl, tokenDecimals });
            } else if (leased.work.kind === "CLAIM") {
              await processReceiverClaim({ work: leased.work, operator: operatorKeypair, rpcUrl });
            } else if (leased.work.kind === "RECOVERY") {
              await processReceiverRecovery({ work: leased.work, operator: operatorKeypair, rpcUrl });
            } else {
              throw new Error(`Unsupported Receiver work kind ${leased.work.kind}`);
            }
          } catch (error) {
            await reportReceiverWork({
              work: leased.work,
              operator,
              status: "FAILED",
              evidence: {
                stage: "CRANKER_EXECUTION",
                reason: error instanceof Error ? error.message : String(error),
              },
            }).catch(() => undefined);
            console.error(`[tsn-cranker] receiver-work-failed id=${leased.work.id}`, error);
          }
        }
        // TIN creation/update intents are still validated and queued by the
        // TSN Node through the Receiver proxy.  They are not Receiver work
        // documents because their encrypted on-chain envelopes must never be
        // copied into the generic public work payload.  Run the dedicated
        // Node-backed TIN pipeline from the same Receiver-only loop so the
        // Cranker advances verification, fee commitment, registry submission,
        // and finalization without falling back to a local queue.
        try {
          await tracedProcessTinOperationWork({
            mempool,
            operator: operatorKeypair,
            connection,
          });
        } catch (error) {
          console.error("[tsn-cranker] tin-operation-loop-failed", error);
        }
        // Receiver polling is fixed-interval. Do not exponentially sleep:
        // work can arrive immediately after an empty lease response and the
        // sender-signed transaction has a short Solana blockhash lifetime.
        await sleep(receiverBasePollMs);
        continue;
      }
      /* Legacy direct-mempool claim/recovery execution is intentionally
       * removed. Receiver work is the only settlement source. */
      /* await postHeartbeat(operator);
      await tracedRaceEpochChallenges({
        mempool,
        operator: operatorKeypair,
        rpcUrl,
        connection,
      });
      await tracedProcessTinOperationWork({
        mempool,
        operator: operatorKeypair,
        connection,
      });

      const intentWork = await mempool.listPendingIntentWork(20);
      for (const item of intentWork) {
        try {
          const sponsoredFeePayer = (
            item.intent as TsnIntentWorkItem["intent"] & {
              senderSignedSettlementFeePayer?: string | null;
            }
          ).senderSignedSettlementFeePayer;
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
            console.warn(
              `[tsn-cranker] canceled-invalid-intent intent=${item.intent.id} reason="${invalidReason}"`,
            );
            continue;
          }

          const submitted = await tracedSubmitIntentOnChainWork({
            item,
            mempool,
            operator: operatorKeypair,
            rpcUrl,
            tokenDecimals,
          });
          console.log(
            `[tsn-cranker] submitted-intent intent=${item.intent.id} escrowed=${submitted.intent} tx=${submitted.signature} claimCredit=onchain+1`,
          );
        } catch (error) {
          if (isPermanentPruSpendPermitFailure(error)) {
            const message =
              error instanceof Error ? error.message : String(error);
            await mempool.updateIntentStatus(item.intent.id, "canceled", {
              source: item.intent.source,
              settlementResolution: "reverted",
              settlementReason: `PRU spend permit rejected permanently: ${message}`,
            });
            console.warn(
              `[tsn-cranker] canceled-pru-spend-intent intent=${item.intent.id} reason="${message}"`,
            );
            continue;
          }
          console.error(
            `[tsn-cranker] failed-intent-submission intent=${item.intent.id}`,
            error,
          );
        }
      }

      const work = await mempool.listPendingWork(20);
      for (const item of work) {
        const retryAfter = claimRetryAfter.get(item.claimRequest.id) ?? 0;
        if (retryAfter > Date.now()) {
          continue;
        }
        claimRetryAfter.delete(item.claimRequest.id);
        try {
          if (Number(item.intent.privacyVersion ?? 1) < 2) {
            await mempool.updateClaimRequestStatus(
              item.claimRequest.id,
              "processing",
            );
          }

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

          const execution = await tracedExecuteClaimWork({
            item,
            mempool,
            operator: operatorKeypair,
            crankerEncryptionSecretKey,
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
            transfer_id: execution.transferId,
            commitment_hash: execution.commitmentHash,
            otdt_hash: execution.otdtHash,
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
          console.log(
            `[tsn-cranker] executed-claim intent=${item.intent.id} escrowed=${execution.intent} claim=${item.claimRequest.id} proof=${proofTxSig} otdt=${execution.otdtHash} claimCredit=onchain-1`,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const transientPermitFailure =
            message.includes("TSN permit request failed (500)") ||
            message.includes("TSN permit request failed (502)") ||
            message.includes("TSN permit request failed (503)") ||
            message.includes("TSN permit request failed (504)");
          if (transientPermitFailure) {
            claimRetryAfter.set(item.claimRequest.id, Date.now() + 30_000);
          }
          await mempool
            .updateClaimRequestStatus(
              item.claimRequest.id,
              transientPermitFailure ? "pending" : "failed",
              {
                settlementReason: transientPermitFailure
                  ? "Permit service temporarily unavailable; claim remains queued."
                  : message,
              },
            )
            .catch(() => undefined);
          console.error(`[tsn-cranker] failed intent=${item.intent.id}`, error);
        }
      }

      const recoveryWork = await mempool.listPendingRecoveryWork(operator, 20);
      for (const item of recoveryWork) {
        if (item.status !== "pending" && item.status !== "leased") {
          continue;
        }

        if (isQuarantinedRecoveryReason(item.settlementReason)) {
          await mempool
            .updateRecoveryStatus(item.id, operator, "failed", {
              settlementReason: item.settlementReason,
            })
            .catch(() => undefined);
          console.warn(
            `[tsn-cranker] recovery-quarantined recoveryId=${recoveryWorkId(item)} reason="previous permanent program failure"`,
          );
          continue;
        }

        try {
          const leased =
            Number(item.privacyVersion ?? 1) >= 2
              ? item
              : await mempool.claimRecoveryLease(item.id, operator);
          const recovery = await tracedExecuteRecoveryWork({
            item: leased,
            operator: operatorKeypair,
            rpcUrl,
            tokenDecimals,
          });
          await mempool.updateRecoveryStatus(item.id, operator, "completed", {
            recoveryTxSig: recovery.signature,
            settlementReason:
              "Escrow liquidity returned to the settlement Cranker vault.",
          });
          console.log(
            `[tsn-cranker] recovered recovery=${item.id} payment=${item.paymentId ?? "private"} transfer=${item.transferId ?? "private"} tx=${recovery.signature} rewardLamports=${item.rewardLamports}`,
          );
        } catch (error) {
          const failureReason = recoveryErrorMessage(error);
          await mempool
            .updateRecoveryStatus(item.id, operator, "failed", {
              settlementReason: failureReason,
            })
            .catch(() => undefined);
          console.error(
            `[tsn-cranker] recovery-quarantined recoveryId=${recoveryWorkId(item)}; manual retry required`,
            error,
          );
        }
      }
      */
    } catch (error) {
      console.error("[tsn-cranker] loop-failed", error);
    }

    await sleep(Number(process.env.TSN_CRANKER_POLL_MS ?? 2000));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
