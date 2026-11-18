import type { ReceiverWork } from "../work-contract";
import type { WorkDependencies } from "./dependencies";

/** Project an already-read row for Node without performing another storage operation. */
export function projectWorkForNode(dependencies: Pick<WorkDependencies, "decryptPayloadForNode">, work: ReceiverWork | null) {
    if (!work)
        return work;
    if (work.kind === "SETTLEMENT")
        return work;
    if (work.kind !== "AUTHORIZED_FUNDING")
        return work;
    const envelope = work.payload.nodeEncryptedPayload;
    // VERIFIED/terminal payment records are deliberately redacted after Node
    // verification. They contain no envelope by design and are safe to return
    // to the authenticated Node for recovery-lineage checks.
    if (!envelope)
        return work;
    if (typeof envelope !== "object")
        throw new Error("NODE_PAYLOAD_ENVELOPE_INVALID");
    const projected = { ...work, payload: dependencies.decryptPayloadForNode(envelope as Parameters<typeof dependencies.decryptPayloadForNode>[0]) } as ReceiverWork;
    if (work.fundingReadiness?.nodeEncryptedPreflight) {
        projected.authorizationPreflight = dependencies.decryptPayloadForNode(work.fundingReadiness.nodeEncryptedPreflight as Parameters<typeof dependencies.decryptPayloadForNode>[0]);
    }
    return projected;
}
