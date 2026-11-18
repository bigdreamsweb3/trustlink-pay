import type { SignedFundingAttachment } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { assertAllowlisted } from "../contracts/validation/assert-allowlisted";
import { assertSenderFundingBlockhashContext } from "../contracts/validation/assert-sender-funding-blockhash-context";
import { attachSignedFundingTransaction } from "./attach-signed-funding-transaction";

/** Attach one immutable signed deposit to its approved intent and wake Node only after durable publication. */
export async function attachSignedFunding(dependencies: Pick<WorkDependencies, "assertAuthorizedFundingIngress" | "assertPaymentAuthorizationIngress" | "createHash" | "createReceivedWork" | "db" | "decryptPayloadForNode" | "encryptPayloadForNode" | "payloadCommitment" | "wakeTsnNode" | "workCollection">, params: SignedFundingAttachment) {
  assertAllowlisted(params as unknown as Record<string, unknown>, new Set(["id", "expectedVersion", "authorizationPayloadCommitment", "senderSignedFundingTransaction", "senderFundingBlockhashContext"]), "fundingAttachment");
  if (typeof params.id !== "string" || !params.id.trim() || params.id !== params.id.trim()) throw new Error("FUNDING_WORK_ID_REQUIRED");
  if (!Number.isSafeInteger(params.expectedVersion) || params.expectedVersion < 1) throw new Error("FUNDING_EXPECTED_VERSION_INVALID");
  if (typeof params.authorizationPayloadCommitment !== "string" || !/^[a-f0-9]{64}$/.test(params.authorizationPayloadCommitment)) throw new Error("FUNDING_AUTHORIZATION_COMMITMENT_REQUIRED");
  if (typeof params.senderSignedFundingTransaction !== "string" || !params.senderSignedFundingTransaction.trim()) throw new Error("OWNER_SIGNED_TCAP_DEPOSIT_REQUIRED");
  assertSenderFundingBlockhashContext(params.senderFundingBlockhashContext);
  const reference = dependencies.workCollection.doc(params.id);
  const attachmentCommitment = dependencies.payloadCommitment({ id: params.id, authorizationPayloadCommitment: params.authorizationPayloadCommitment, senderSignedFundingTransaction: params.senderSignedFundingTransaction, senderFundingBlockhashContext: params.senderFundingBlockhashContext });
  const result = await dependencies.db.runTransaction(attachSignedFundingTransaction.bind(null, dependencies, reference, params, attachmentCommitment));
  if (result.attached) await dependencies.wakeTsnNode("AUTHORIZED_FUNDING");
  return result.work;
}
