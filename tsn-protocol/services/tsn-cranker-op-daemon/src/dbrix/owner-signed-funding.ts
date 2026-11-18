import { Transaction, PublicKey, type Connection } from "@solana/web3.js";
import { getBase58Decoder } from "@solana/kit";
import { createHash } from "node:crypto";

export type FundingBlockhashContext = {
  blockhash: string;
  lastValidBlockHeight: number;
  contextSlot: number;
};

export type OwnerSignedFunding = {
  wire: Buffer;
  ownerSignature: Buffer;
  blockhashContext: FundingBlockhashContext;
};

export type FundingSubmissionAttempt = {
  endpoint: "PRIMARY" | "FALLBACK";
  phase: "BLOCK_HEIGHT" | "SEND" | "SIGNATURE" | "CONFIRM";
  observedBlockHeight: number | null;
  remainingBlocks: number | null;
  sendInvoked: boolean;
  outcome: string;
  rpcCode?: number;
  instruction?: number;
  programError?: number;
};

export type FundingSubmissionTrace = {
  expectedSignature: string;
  blockhashFingerprint: string;
  contextSlot: number;
  lastValidBlockHeight: number;
  minimumRemainingBlocks: 20;
  attempts: FundingSubmissionAttempt[];
};

/** Public transaction identity and bounded bank observations, never a wire or provider body. */
export function createOwnerFundingSubmission(funding: OwnerSignedFunding): FundingSubmissionTrace {
  return {
    expectedSignature: getBase58Decoder().decode(funding.ownerSignature),
    blockhashFingerprint: createHash("sha256").update(new PublicKey(funding.blockhashContext.blockhash).toBytes()).digest("hex").slice(0, 16),
    contextSlot: funding.blockhashContext.contextSlot,
    lastValidBlockHeight: funding.blockhashContext.lastValidBlockHeight,
    minimumRemainingBlocks: 20,
    attempts: [],
  };
}

/** Carry the original signature to the daemon's single FAILED-report boundary. */
export class OwnerFundingSubmissionError extends Error {
  readonly evidence: Record<string, unknown>;

  constructor(readonly reason: string, trace: FundingSubmissionTrace) {
    super(`TCAP funding submission failed phase=${trace.attempts.at(-1)?.phase ?? "BLOCK_HEIGHT"} reason=${reason}; reconcile signature ${trace.expectedSignature}`);
    this.name = "OwnerFundingSubmissionError";
    this.evidence = {
      signature: trace.expectedSignature,
      stage: "TCAP_PRIVATE_FUNDING_V1_FAILED",
      fundingSubmission: { ...trace, attempts: trace.attempts.map(attempt => ({ ...attempt })) },
    };
  }
}

/** Dependency failures can contain URLs, request bodies and program logs. Retain only bounded codes. */
function fundingRpcFailure(error: unknown, attempt: FundingSubmissionAttempt): string {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  if (typeof value.code === "number" && Number.isSafeInteger(value.code)) attempt.rpcCode = value.code;
  const transactionError = value.transactionError;
  if (transactionError && typeof transactionError === "object" && !Array.isArray(transactionError)) {
    const instructionError = (transactionError as Record<string, unknown>).InstructionError;
    if (Array.isArray(instructionError) && instructionError.length === 2) {
      if (Number.isInteger(instructionError[0]) && instructionError[0] >= 0 && instructionError[0] <= 255) attempt.instruction = instructionError[0];
      const custom = instructionError[1]?.Custom;
      if (typeof custom === "number" && Number.isInteger(custom) && custom >= 0 && custom <= 0xffffffff) attempt.programError = custom;
    }
  }
  // These exact classifications select the existing same-wire bank fallback or status read.
  const message = error instanceof Error ? error.message : "";
  if (transactionError === "BlockhashNotFound" || /BlockhashNotFound|blockhash not found/i.test(message)) return "BLOCKHASH_NOT_FOUND";
  if (/already processed|already been processed/i.test(message)) return "ALREADY_PROCESSED";
  return error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "TIMEOUT" : "RPC_OR_TRANSPORT_ERROR";
}

/** Validate the Node-attested routing context against the unchanged wallet wire. */
export function readOwnerSignedFunding(encoded: unknown, rawContext: unknown): OwnerSignedFunding {
  if (typeof encoded !== "string" || !encoded) {
    throw new Error("Node did not provide the owner-signed TCAP deposit transaction");
  }
  if (!rawContext || typeof rawContext !== "object" || Array.isArray(rawContext)
      || Object.keys(rawContext).sort().join(",") !== "blockhash,contextSlot,lastValidBlockHeight") {
    throw new Error("TCAP_FUNDING_BLOCKHASH_CONTEXT_INVALID");
  }
  const context = rawContext as Record<string, unknown>;
  if (typeof context.blockhash !== "string"
      || !Number.isSafeInteger(context.lastValidBlockHeight) || Number(context.lastValidBlockHeight) <= 0
      || !Number.isSafeInteger(context.contextSlot) || Number(context.contextSlot) < 0) {
    throw new Error("TCAP_FUNDING_BLOCKHASH_CONTEXT_INVALID");
  }
  try {
    const hash = new PublicKey(context.blockhash);
    if (hash.toBase58() !== context.blockhash || hash.toBytes().every(byte => byte === 0)) {
      throw new Error("noncanonical blockhash");
    }
  } catch {
    throw new Error("TCAP_FUNDING_BLOCKHASH_CONTEXT_INVALID");
  }
  const wire = Buffer.from(encoded, "base64");
  if (!wire.length || wire.toString("base64") !== encoded) {
    throw new Error("Owner-signed TCAP deposit is not valid base64 transaction data");
  }
  const transaction = Transaction.from(wire);
  if (transaction.recentBlockhash !== context.blockhash) {
    throw new Error("TCAP_FUNDING_BLOCKHASH_CONTEXT_MISMATCH");
  }
  const ownerSignature = transaction.signatures.find(item => item.signature)?.signature;
  if (!ownerSignature) throw new Error("Owner-signed TCAP deposit signature is missing");
  const verifiedWire = transaction.serialize({ requireAllSignatures: true, verifySignatures: true });
  if (!verifiedWire.equals(wire)) throw new Error("Cranker will not alter the owner-signed TCAP deposit transaction");
  return {
    wire,
    ownerSignature,
    blockhashContext: {
      blockhash: context.blockhash,
      lastValidBlockHeight: Number(context.lastValidBlockHeight),
      contextSlot: Number(context.contextSlot),
    },
  };
}

/** Check the same 20-block margin as native settlement before each unchanged-wire preflight. */
export async function sendOwnerSignedFunding(
  connection: Pick<Connection, "getBlockHeight" | "sendRawTransaction">,
  funding: OwnerSignedFunding,
  trace = createOwnerFundingSubmission(funding),
  endpoint: FundingSubmissionAttempt["endpoint"] = "PRIMARY",
): Promise<string> {
  const attempt: FundingSubmissionAttempt = {
    endpoint, phase: "BLOCK_HEIGHT", observedBlockHeight: null, remainingBlocks: null,
    sendInvoked: false, outcome: "PENDING",
  };
  trace.attempts.push(attempt);
  let height: number;
  try {
    height = await connection.getBlockHeight({ commitment: "confirmed", minContextSlot: funding.blockhashContext.contextSlot });
  } catch (error) {
    attempt.outcome = error instanceof Error && ["SyntaxError", "StructError"].includes(error.name)
      ? "BLOCK_HEIGHT_INVALID" : "BLOCK_HEIGHT_UNAVAILABLE";
    fundingRpcFailure(error, attempt);
    throw new OwnerFundingSubmissionError(attempt.outcome, trace);
  }
  if (!Number.isSafeInteger(height) || height <= 0) {
    attempt.outcome = "BLOCK_HEIGHT_INVALID";
    throw new OwnerFundingSubmissionError(attempt.outcome, trace);
  }
  attempt.observedBlockHeight = height;
  attempt.remainingBlocks = funding.blockhashContext.lastValidBlockHeight - height;
  if (attempt.remainingBlocks < 20) {
    attempt.outcome = "BLOCKHASH_TOO_OLD_FOR_SUBMISSION";
    throw new OwnerFundingSubmissionError(attempt.outcome, trace);
  }
  attempt.phase = "SEND";
  attempt.sendInvoked = true;
  let signature: string;
  try {
    signature = await connection.sendRawTransaction(funding.wire, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      minContextSlot: funding.blockhashContext.contextSlot,
    });
  } catch (error) {
    attempt.outcome = fundingRpcFailure(error, attempt);
    if (attempt.outcome === "ALREADY_PROCESSED") return trace.expectedSignature;
    throw new OwnerFundingSubmissionError(attempt.outcome, trace);
  }
  attempt.phase = "SIGNATURE";
  if (signature !== trace.expectedSignature) {
    attempt.outcome = "RPC_SIGNATURE_MISMATCH";
    throw new OwnerFundingSubmissionError(attempt.outcome, trace);
  }
  attempt.outcome = "SIGNATURE_RETURNED";
  return signature;
}
