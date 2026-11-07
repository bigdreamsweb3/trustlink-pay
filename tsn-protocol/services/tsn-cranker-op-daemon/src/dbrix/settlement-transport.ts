import { createHash } from "node:crypto";
import {
  AccountRole, address, addSignersToTransactionMessage, appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime, assertIsTransactionWithinSizeLimit,
  createSolanaRpc, createTransactionMessage, getSignatureFromTransaction,
  getTransactionEncoder, pipe, setTransactionMessageConfig,
  isSolanaError, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners, type TransactionPartialSigner, type TransactionSigner,
} from "@solana/kit";
import type { TransactionInstruction } from "@solana/web3.js";

export type SettlementSubmission = {
  signature: string; blockhash: string; lastValidBlockHeight: string;
  wireSha256: string; wireBytes: number;
};

function assertValidBlockHeight(value: unknown): asserts value is bigint {
  if (typeof value !== "bigint" || value <= 0n || value > 0xffffffffffffffffn) {
    throw new Error("TCAP_TRANSACTION_BLOCKHASH_HEIGHT_INVALID");
  }
}

/** Preserve numeric diagnostics only: RPC messages/logs may contain private data. */
function submissionFailure(error: unknown, timedOut: boolean): string {
  if (isSolanaError(error)) {
    const code = error.context.__code;
    if (code === SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE) {
      let reason = `PREFLIGHT_REJECTED rpcCode=${code}`;
      if (isSolanaError(error.cause)) {
        const context = error.cause.context as Record<string, unknown>;
        reason += ` solanaCode=${context.__code}`;
        if (context.__code === SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND) reason += " transactionError=BLOCKHASH_NOT_FOUND";
        for (const [field, label, max] of [["index", "instruction", 255], ["code", "programError", 0xffffffff]] as const) {
          const value = context[field];
          if ((typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max)
              || (typeof value === "bigint" && value >= 0n && value <= BigInt(max))) reason += ` ${label}=${value}`;
        }
      }
      return reason;
    }
    if (code === SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR) {
      const status = error.context.statusCode;
      return Number.isInteger(status) && status >= 100 && status <= 599 ? `HTTP_ERROR httpStatus=${status}` : "HTTP_ERROR";
    }
    if (Number.isSafeInteger(code)) return code < 0 ? `RPC_REJECTED rpcCode=${code}` : `SOLANA_ERROR solanaCode=${code}`;
  }
  return timedOut ? "TIMEOUT" : "RPC_OR_TRANSPORT_ERROR";
}

/** Same V1 message contract as DBrix 0.2; one HTTP broadcast, bounded HTTP confirmation. */
export async function sendSettlementV1(instructions: readonly TransactionInstruction[], options: {
  payerSigner: TransactionPartialSigner; additionalSigners: readonly TransactionSigner[];
  rpcUrl: string; onSigned: (submission: SettlementSubmission) => Promise<void>;
  confirmationTimeoutMs?: number; pollMs?: number;
}): Promise<string> {
  if (!instructions.length || !options.rpcUrl) throw new Error("Settlement instructions and RPC are required");
  const rpc = createSolanaRpc(options.rpcUrl);
  const { context, value: lifetime } = await rpc.getLatestBlockhash({ commitment: "confirmed" })
    .send({ abortSignal: AbortSignal.timeout(15_000) }).catch(() => {
      throw new Error("TCAP_TRANSACTION_BLOCKHASH_LIFETIME_UNAVAILABLE");
    });
  assertValidBlockHeight(lifetime?.lastValidBlockHeight);
  const message = pipe(
    createTransactionMessage({ version: 1 }),
    tx => setTransactionMessageFeePayerSigner(options.payerSigner, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(lifetime, tx),
    tx => appendTransactionMessageInstructions(instructions.map(ix => ({
      programAddress: address(ix.programId.toBase58()),
      accounts: ix.keys.map(key => ({ address: address(key.pubkey.toBase58()), role: key.isSigner
        ? key.isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER
        : key.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY })),
      data: Uint8Array.from(ix.data),
    })), tx),
    tx => addSignersToTransactionMessage([options.payerSigner, ...options.additionalSigners], tx),
    tx => setTransactionMessageConfig({ computeUnitLimit: 1_400_000, loadedAccountsDataSizeLimit: 64 * 1024 * 1024 }, tx),
  );
  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);
  assertIsTransactionWithinSizeLimit(signed);
  const wire = getTransactionEncoder().encode(signed);
  if (wire.length > 4096) throw new Error(`Solana v1 transaction is ${wire.length} bytes; maximum is 4096`);
  // Mother validation may outlive this hash. Keep a forwarding margin before
  // recording any submission identity; retry requires fresh Node verification.
  let heightBeforeSubmission: bigint;
  try {
    heightBeforeSubmission = await rpc.getBlockHeight({ commitment: "confirmed", minContextSlot: context.slot })
      .send({ abortSignal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("TCAP_TRANSACTION_BLOCKHASH_HEIGHT_UNAVAILABLE");
  }
  assertValidBlockHeight(heightBeforeSubmission);
  if (lifetime.lastValidBlockHeight - heightBeforeSubmission < 20n) {
    throw new Error("TCAP_TRANSACTION_BLOCKHASH_TOO_OLD_FOR_SUBMISSION");
  }
  const signature = getSignatureFromTransaction(signed);
  const submission = { signature, blockhash: lifetime.blockhash,
    lastValidBlockHeight: String(lifetime.lastValidBlockHeight),
    wireSha256: createHash("sha256").update(Buffer.from(wire)).digest("hex"), wireBytes: wire.length };
  // A durable receipt must be acknowledged before the first broadcast. Its
  // presence means execution is possible, even if a response is lost.
  await options.onSigned(submission);
  const deadline = AbortSignal.timeout(options.confirmationTimeoutMs ?? 40_000);
  let phase = "SEND", failure = "RPC_OR_TRANSPORT_ERROR";
  try {
    const returned = await rpc.sendTransaction(Buffer.from(wire).toString("base64") as never, {
      encoding: "base64", preflightCommitment: "confirmed", skipPreflight: false, maxRetries: 0n,
      // The gateway may select a different bank for SEND. Reject banks below
      // the slot that supplied this message's unchanged blockhash.
      minContextSlot: context.slot,
    }).send({ abortSignal: deadline });
    if (returned !== signature) { failure = "RPC_SIGNATURE_MISMATCH"; throw new Error(failure); }
    phase = "CONFIRM";
    for (;;) {
      const { value: [status] } = await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send({ abortSignal: deadline });
      if (status?.err) { failure = "CHAIN_REJECTED"; throw new Error(failure); }
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return signature;
      const height = await rpc.getBlockHeight({ commitment: "confirmed", minContextSlot: context.slot }).send({ abortSignal: deadline });
      if (height > lifetime.lastValidBlockHeight) { failure = "BLOCKHASH_EXPIRED"; throw new Error(failure); }
      await new Promise<void>((resolve, reject) => {
        deadline.throwIfAborted();
        const timer = setTimeout(() => { deadline.removeEventListener("abort", abort); resolve(); }, options.pollMs ?? 1000);
        const abort = () => { clearTimeout(timer); reject(deadline.reason); };
        deadline.addEventListener("abort", abort, { once: true });
      });
    }
  } catch (error) {
    // Dependency exceptions can contain RPC URLs or raw request bodies.
    if (failure === "RPC_OR_TRANSPORT_ERROR") failure = submissionFailure(error, deadline.aborted);
    throw new Error(`Settlement submission/confirmation failed phase=${phase} reason=${failure}; reconcile signature ${signature}`);
  }
}
