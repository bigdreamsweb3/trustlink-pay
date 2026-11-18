/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
export function redactedPaymentPayload(payload: Record<string, unknown>) {
    // The complete ingress envelope is encrypted at receipt and is available
    // only through the authenticated Node projection. Once verification has
    // completed, Firebase retains only the queue reference needed to derive
    // settlement work. Recipient routing stays in the Node's separate, expiring binding.
    return {
        paymentId: String(payload.paymentId ?? ""),
        recipientHash: String(payload.recipientHash ?? ""),
    };
}
