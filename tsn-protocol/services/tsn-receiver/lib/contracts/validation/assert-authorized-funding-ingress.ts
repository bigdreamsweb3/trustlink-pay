import { assertPaymentAuthorizationPayload } from "./assert-payment-authorization-payload";
import { assertSenderFundingBlockhashContext } from "./assert-sender-funding-blockhash-context";

/** Validate completed ingress assembled from the immutable approval and its exact signed deposit. */
export function assertAuthorizedFundingIngress(payload: Record<string, unknown>): void {
  assertPaymentAuthorizationPayload(payload);
  if (typeof payload.senderSignedFundingTransaction !== "string" || !payload.senderSignedFundingTransaction.trim()) {
    throw new Error("OWNER_SIGNED_TCAP_DEPOSIT_REQUIRED");
  }
  assertSenderFundingBlockhashContext(payload.senderFundingBlockhashContext);
}
