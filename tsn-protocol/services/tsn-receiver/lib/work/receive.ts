/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { persistReceivedWork } from "./persist-received-work";
export async function receive(dependencies: Pick<WorkDependencies, "assertPaymentAuthorizationIngress" | "assertExternalWorkKind" | "createReceivedWork" | "db" | "encryptPayloadForNode" | "payloadCommitment" | "wakeTsnNode" | "workCollection">, input: {
    id?: string;
    kind: WorkKind;
    payload: Record<string, unknown>;
}) {
    dependencies.assertExternalWorkKind(input.kind);
    if (input.kind === "AUTHORIZED_FUNDING")
        dependencies.assertPaymentAuthorizationIngress(input.payload);
    if (input.kind === "AUTHORIZED_FUNDING" && input.id && input.id !== input.payload.paymentId) throw new Error("FUNDING_WORK_ID_MISMATCH");
    const durablePayload = input.kind === "AUTHORIZED_FUNDING"
        ? {
            paymentId: String(input.payload.paymentId), recipientHash: String(input.payload.recipientHash),
            nodeEncryptedPayload: dependencies.encryptPayloadForNode(input.payload),
        }
        : input.payload;
    const work: ReceiverWork = dependencies.createReceivedWork({ ...input, ...(input.kind === "AUTHORIZED_FUNDING" ? { id: String(input.payload.paymentId) } : {}), payload: durablePayload, payloadCommitment: dependencies.payloadCommitment(input.payload) });
    if (input.kind === "AUTHORIZED_FUNDING") {
        work.fundingPhase = "AUTHORIZATION";
        work.authorizationPayloadCommitment = work.payloadCommitment;
    }
    const ref = dependencies.workCollection.doc(work.id);
    const result = await dependencies.db.runTransaction(persistReceivedWork.bind(null, dependencies, ref, work));
    // Notify only after the Firestore transaction is durable. The notification
    // contains no payload; the Node re-reads work through its authenticated API.
    if (result.created) {
        await dependencies.wakeTsnNode(input.kind);
    }
    return result.work;
}
