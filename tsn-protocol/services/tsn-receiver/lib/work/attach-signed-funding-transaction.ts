import type { ReceiverWork, SignedFundingAttachment } from "../work-contract";
import type { WorkDependencies, DocumentPort, TransactionPort } from "./dependencies";

/** Guard the approved message identity and create the final funding/settlement lineage atomically. */
export async function attachSignedFundingTransaction(dependencies: Pick<WorkDependencies, "assertAuthorizedFundingIngress" | "assertPaymentAuthorizationIngress" | "createHash" | "createReceivedWork" | "decryptPayloadForNode" | "encryptPayloadForNode" | "payloadCommitment" | "workCollection">, reference: DocumentPort, params: SignedFundingAttachment, attachmentCommitment: string, transaction: TransactionPort) {
  const snapshot = await transaction.get(reference);
  if (!snapshot.exists) throw new Error("WORK_NOT_FOUND");
  const current = snapshot.data() as ReceiverWork;
  if (current.kind !== "AUTHORIZED_FUNDING") throw new Error("FUNDING_WORK_KIND_INVALID");
  if (current.authorizationPayloadCommitment !== params.authorizationPayloadCommitment) throw new Error("FUNDING_AUTHORIZATION_COMMITMENT_MISMATCH");
  if (current.fundingAttachmentCommitment) {
    if (current.fundingAttachmentCommitment !== attachmentCommitment) throw new Error("FUNDING_ATTACHMENT_CONFLICT");
    return { work: current, attached: false };
  }
  if (current.fundingPhase !== "AUTHORIZATION" || current.status !== "FUNDING_READY") throw new Error("FUNDING_NOT_READY");
  if (current.stateVersion !== params.expectedVersion) throw new Error("STALE_STATE_VERSION");
  const readiness = current.fundingReadiness;
  if (!readiness || !current.fundingReadinessAttestation || readiness.authorizationPayloadCommitment !== params.authorizationPayloadCommitment
      || !Number.isFinite(Date.parse(readiness.expiresAt))) throw new Error("FUNDING_READINESS_EVIDENCE_REQUIRED");
  if (Date.parse(readiness.expiresAt) <= Date.now()) throw new Error("FUNDING_READINESS_EXPIRED");
  const envelope = current.payload.nodeEncryptedPayload;
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new Error("NODE_PAYLOAD_ENVELOPE_MISSING");
  const original = dependencies.decryptPayloadForNode(envelope as Parameters<typeof dependencies.decryptPayloadForNode>[0]);
  dependencies.assertPaymentAuthorizationIngress(original);
  if (original.paymentId !== current.id || dependencies.payloadCommitment(original) !== params.authorizationPayloadCommitment) throw new Error("FUNDING_AUTHORIZATION_COMMITMENT_MISMATCH");
  const payload = { ...original, senderSignedFundingTransaction: params.senderSignedFundingTransaction, senderFundingBlockhashContext: params.senderFundingBlockhashContext };
  dependencies.assertAuthorizedFundingIngress(payload);
  const payloadCommitment = dependencies.payloadCommitment(payload);
  const settlementId = `settlement-${dependencies.createHash("sha256").update(`${current.id}:${payloadCommitment}`).digest("hex").slice(0, 32)}`;
  const settlementReference = dependencies.workCollection.doc(settlementId);
  const settlement = await transaction.get(settlementReference);
  if (settlement.exists) throw new Error("FUNDING_SETTLEMENT_ID_CONFLICT");
  const patch = {
    fundingPhase: "SIGNED_DEPOSIT" as const, fundingAttachmentCommitment: attachmentCommitment,
    payloadCommitment, payload: { paymentId: current.payload.paymentId ?? current.id, recipientHash: current.payload.recipientHash, nodeEncryptedPayload: dependencies.encryptPayloadForNode(payload) },
    status: "RECEIVED" as const, stateVersion: current.stateVersion + 1, updatedAt: new Date().toISOString(),
    nodeLease: null, crankerLease: null, verification: null,
  };
  transaction.update(reference, patch);
  transaction.create(settlementReference, dependencies.createReceivedWork({ id: settlementId, kind: "SETTLEMENT", payload: { paymentId: current.payload.paymentId ?? current.id, intentId: current.id, source: "tsn-receiver-at-funding-attachment" } }));
  return { work: { ...current, ...patch } as ReceiverWork, attached: true };
}
