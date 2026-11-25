import { createRequire } from "node:module";

const require = createRequire(new URL("../package.json", import.meta.url));
const base58Module = require("bs58");
const base58 = base58Module.default ?? base58Module;

/** One signed broadcast followed by bounded HTTP reads; never opens a subscription. */
export async function sendAndConfirmDebitTransaction(connection, transaction, signers, options) {
  const { context, value: lifetime } = options.blockhashContext ?? {};
  if (!Number.isSafeInteger(context?.slot) || context.slot <= 0
      || !Number.isSafeInteger(lifetime?.lastValidBlockHeight) || lifetime.lastValidBlockHeight <= 0
      || transaction.recentBlockhash !== lifetime.blockhash
      || transaction.lastValidBlockHeight !== lifetime.lastValidBlockHeight) {
    throw Error("TIN_DEBIT_BLOCKHASH_CONTEXT_INVALID");
  }
  transaction.sign(...signers);
  const wire = transaction.serialize();
  if (wire.length > 1232) throw Error("TIN_DEBIT_PACKET_TOO_LARGE");
  const signature = base58.encode(transaction.signature);
  const clock = options.clock ?? Date.now;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const deadline = clock() + (options.timeoutMs ?? 120_000);
  const fail = reason => Error(`${reason}; inspect signature ${signature} and verifier status before retry`);
  // Print the candidate before broadcasting, including if the send acknowledgement is lost.
  options.onSigned?.({ signature, blockhash: lifetime.blockhash,
    lastValidBlockHeight: lifetime.lastValidBlockHeight, contextSlot: context.slot });
  try {
    const returned = await connection.sendRawTransaction(wire, {
      skipPreflight: false, preflightCommitment: "confirmed", minContextSlot: context.slot, maxRetries: 3,
    });
    if (returned !== signature) throw fail("TIN_DEBIT_RPC_SIGNATURE_MISMATCH");
  } catch (error) {
    if (error.message?.startsWith("TIN_DEBIT_RPC_SIGNATURE_MISMATCH")) throw error;
    throw fail("TIN_DEBIT_SEND_UNCONFIRMED");
  }
  let reason = "TIN_DEBIT_CONFIRMATION_TIMEOUT";
  async function readStatus() {
    const result = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    if (!Number.isSafeInteger(result?.context?.slot) || result.context.slot < context.slot
        || !Array.isArray(result.value) || result.value.length !== 1) {
      throw Error("TIN_DEBIT_SIGNATURE_CONTEXT_UNAVAILABLE");
    }
    const status = result.value[0];
    if (status?.err != null) return "rejected";
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return Number.isSafeInteger(status.slot) && status.slot >= context.slot ? "confirmed" : "unavailable";
    }
    return "pending";
  }
  while (clock() < deadline) {
    try {
      const status = await readStatus();
      if (status === "confirmed") return signature;
      if (status === "rejected") throw fail("TIN_DEBIT_CHAIN_REJECTED");
      const height = await connection.getBlockHeight({ commitment: "confirmed", minContextSlot: context.slot });
      if (!Number.isSafeInteger(height) || height <= 0) throw Error("TIN_DEBIT_BLOCK_HEIGHT_UNAVAILABLE");
      if (height > lifetime.lastValidBlockHeight) {
        // A routed status read may lag behind the bank reporting expiry. Reconcile once more.
        const finalStatus = await readStatus();
        if (finalStatus === "confirmed") return signature;
        if (finalStatus === "rejected") throw fail("TIN_DEBIT_CHAIN_REJECTED");
        throw fail("TIN_DEBIT_CONFIRMATION_EXPIRED");
      }
      reason = "TIN_DEBIT_CONFIRMATION_TIMEOUT";
    } catch (error) {
      if (/^TIN_DEBIT_(CHAIN_REJECTED|CONFIRMATION_EXPIRED);/.test(error.message)) throw error;
      reason = "TIN_DEBIT_CONFIRMATION_RPC_UNAVAILABLE";
    }
    await sleep(Math.min(options.pollMs ?? 1000, Math.max(0, deadline - clock())));
  }
  throw fail(reason);
}
