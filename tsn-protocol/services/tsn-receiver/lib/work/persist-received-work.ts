/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
export async function persistReceivedWork(_dependencies: Pick<WorkDependencies, "createReceivedWork">, ref: any, work: any, transaction: any) {
    const existing = await transaction.get(ref);
    if (existing.exists) {
        const current = existing.data() as ReceiverWork;
        if ((current.authorizationPayloadCommitment ?? current.payloadCommitment) !== work.payloadCommitment || current.kind !== work.kind) {
            throw new Error("IDEMPOTENCY_CONFLICT");
        }
        return { work: current, created: false };
    }
    transaction.create(ref, work);
    return { work, created: true };
}
