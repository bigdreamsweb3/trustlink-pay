import type { SenderFundingBlockhashContext } from "../models";
import { assertAllowlisted } from "./assert-allowlisted";
import { decodeBase58 } from "./decode-sender-base58";

/** Validate the exact bank/lifetime metadata; Node separately binds the hash to signed transaction bytes. */
export function assertSenderFundingBlockhashContext(value: unknown): asserts value is SenderFundingBlockhashContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("SENDER_FUNDING_BLOCKHASH_CONTEXT_REQUIRED");
  }
  const context = value as Record<string, unknown>;
  assertAllowlisted(context, new Set(["blockhash", "lastValidBlockHeight", "contextSlot"]), "senderFundingBlockhashContext");
  if (typeof context.blockhash !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(context.blockhash)
      || typeof context.lastValidBlockHeight !== "number" || !Number.isSafeInteger(context.lastValidBlockHeight) || context.lastValidBlockHeight <= 0
      || typeof context.contextSlot !== "number" || !Number.isSafeInteger(context.contextSlot) || context.contextSlot < 0) {
    throw new Error("SENDER_FUNDING_BLOCKHASH_CONTEXT_INVALID");
  }
  try {
    if (decodeBase58(context.blockhash).equals(Buffer.alloc(32))) throw new Error("SENDER_FUNDING_BLOCKHASH_CONTEXT_INVALID");
  } catch {
    throw new Error("SENDER_FUNDING_BLOCKHASH_CONTEXT_INVALID");
  }
}
