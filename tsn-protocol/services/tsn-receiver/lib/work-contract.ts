/** Stable Receiver work-contract interface; implementations live in named functional components. */
export type { WorkKind, WorkStatus, ReceiverWork, PayloadDelta, SignedFundingAttachment } from "./contracts/models";
export { isSupportedWorkKind } from "./contracts/kinds/is-supported-work-kind";
export { nonExecutionContextCommitment } from "./contracts/recovery/non-execution-context-commitment";
export { hasResolvedNonExecution } from "./contracts/recovery/has-resolved-non-execution";
export { assertExternalWorkKind } from "./contracts/kinds/assert-external-work-kind";
export { assertAuthorizedFundingIngress } from "./contracts/validation/assert-authorized-funding-ingress";
export { assertPaymentAuthorizationIngress } from "./contracts/validation/assert-payment-authorization-ingress";
export { assertDurablePayload } from "./contracts/validation/assert-durable-payload";
export { diffPayload } from "./contracts/verification/diff-payload";
export { compactVerificationPayload } from "./contracts/verification/compact-verification-payload";
export { compactAuthorizedFundingVerification } from "./contracts/verification/compact-authorized-funding-verification";
export { verifiedPayloadForWork } from "./contracts/verification/verified-payload-for-work";
export { crankerExecutionPayload } from "./contracts/projection/cranker-execution-payload";
export { crankerAuthorizationForWork } from "./contracts/projection/cranker-authorization-for-work";
export { payloadCommitment } from "./contracts/commitments/payload-commitment";
export { createReceivedWork } from "./contracts/creation/create-received-work";
export { publicCoordinationPayload } from "./contracts/projection/public-coordination-payload";
