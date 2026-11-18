/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { hasDefinedVerifiedField } from "../contracts/verification/has-defined-verified-field";
import { verifiedFieldEntry } from "../contracts/verification/verified-field-entry";
export function paymentReceiptVerification(dependencies: Pick<WorkDependencies, "compactVerificationPayload" | "verifiedPayloadForWork">, work: ReceiverWork) {
    const verified = dependencies.verifiedPayloadForWork(work);
    if (!verified)
        return work.verification ?? {};
    const keep = ["paymentId", "tokenMintAddress", "amount"];
    return dependencies.compactVerificationPayload(work.payload, {
        verificationType: work.verification?.verificationType ?? "TSN_AUTHORIZED_FUNDING",
        ...(work.verification?.nodeAttestation ? { nodeAttestation: work.verification.nodeAttestation } : {}),
        verifiedPayload: Object.fromEntries(keep.filter(hasDefinedVerifiedField.bind(null, verified)).map(verifiedFieldEntry.bind(null, verified))),
    });
}
