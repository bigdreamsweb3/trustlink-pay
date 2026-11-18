import { createHash } from "node:crypto";
import { payloadCommitment } from "../../work-contract";
import type { ReceiverWork } from "../../work-contract";

/** assertFundingLineage component. Inputs and results retain the original settlement-retry contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function assertFundingLineage(current: ReceiverWork, funding: ReceiverWork) {
  if (funding.kind !== "AUTHORIZED_FUNDING" || funding.status !== "CONFIRMED" || !funding.result?.signature) {
    throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
  }
  const expectedId = `settlement-${createHash("sha256").update(`${funding.id}:${funding.payloadCommitment}`).digest("hex").slice(0, 32)}`;
  if (current.id !== expectedId || current.payload.intentId !== funding.id
      || current.payload.paymentId !== (funding.payload.paymentId ?? funding.id)
      || payloadCommitment(current.payload) !== current.payloadCommitment) {
    throw new Error("SETTLEMENT_FUNDING_REFERENCE_MISMATCH");
  }
}
