import { createHash } from "node:crypto";
import {
  AccountRole, address, addSignersToTransactionMessage, appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime, assertIsTransactionWithinSizeLimit,
  createSolanaRpc, createTransactionMessage, getSignatureFromTransaction,
  getTransactionEncoder, pipe, setTransactionMessageConfig,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners, type TransactionPartialSigner, type TransactionSigner,
} from "@solana/kit";
import type { TransactionInstruction } from "@solana/web3.js";

export type SettlementSubmission = {
  signature: string; blockhash: string; lastValidBlockHeight: string;
  wireSha256: string; wireBytes: number;
};

/** Same V1 message contract as DBrix 0.2; one HTTP broadcast, bounded HTTP confirmation. */
export async function sendSettlementV1(instructions: readonly TransactionInstruction[], options: {
  payerSigner: TransactionPartialSigner; additionalSigners: readonly TransactionSigner[];
  rpcUrl: string; onSigned: (submission: SettlementSubmission) => Promise<void>;
  confirmationTimeoutMs?: number; pollMs?: number;
}): Promise<string> {
  if (!instructions.length || !options.rpcUrl) throw new Error("Settlement instructions and RPC are required");
  const rpc = createSolanaRpc(options.rpcUrl);
  const { value: lifetime } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send({ abortSignal: AbortSignal.timeout(15_000) });
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
  const signature = getSignatureFromTransaction(signed);
  const submission = { signature, blockhash: lifetime.blockhash,
    lastValidBlockHeight: String(lifetime.lastValidBlockHeight),
    wireSha256: createHash("sha256").update(Buffer.from(wire)).digest("hex"), wireBytes: wire.length };
  // A durable receipt must be acknowledged before the first broadcast. Its
  // presence means execution is possible, even if a response is lost.
  await options.onSigned(submission);
  const deadline = AbortSignal.timeout(options.confirmationTimeoutMs ?? 40_000);
  try {
    const returned = await rpc.sendTransaction(Buffer.from(wire).toString("base64") as never, {
      encoding: "base64", preflightCommitment: "confirmed", skipPreflight: false, maxRetries: 0n,
    }).send({ abortSignal: deadline });
    if (returned !== signature) throw new Error("RPC returned a different settlement signature");
    for (;;) {
      const { value: [status] } = await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send({ abortSignal: deadline });
      if (status?.err) throw new Error("Settlement transaction failed on chain");
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return signature;
      const height = await rpc.getBlockHeight({ commitment: "confirmed" }).send({ abortSignal: deadline });
      if (height > lifetime.lastValidBlockHeight) throw new Error("Settlement blockhash expired; reconcile signature before retrying");
      await new Promise<void>((resolve, reject) => {
        deadline.throwIfAborted();
        const timer = setTimeout(() => { deadline.removeEventListener("abort", abort); resolve(); }, options.pollMs ?? 1000);
        const abort = () => { clearTimeout(timer); reject(deadline.reason); };
        deadline.addEventListener("abort", abort, { once: true });
      });
    }
  } catch {
    // Dependency exceptions can contain RPC URLs or raw request bodies.
    throw new Error(`Settlement submission/confirmation failed; reconcile signature ${signature}`);
  }
}
