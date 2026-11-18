import { createHash, randomInt } from "node:crypto";
import { workCollection, db } from "../firebase";
import { isSupportedWorkKind, hasResolvedNonExecution, assertExternalWorkKind, assertAuthorizedFundingIngress, compactAuthorizedFundingVerification, compactVerificationPayload, createReceivedWork, payloadCommitment, verifiedPayloadForWork } from "../work-contract";
import { decryptPayloadForNode, encryptPayloadForNode } from "../node-envelope";
import { assertNodeVerificationAttestation } from "../node-verification";
import { wakeTsnNode } from "../node-wake";
import { publishCrankerWake } from "../cranker-wake";
import { nativeWorkRetryPatch } from "../native-work-retry";
import { snapshotRetryPatch } from "../settlement-retry";
import type { WorkDependencies } from "./dependencies";
import { assertPaymentAuthorizationIngress } from "../work-contract";

/** Composition preserves the original Firebase/configuration initialization boundary. */
export const workDependencies: WorkDependencies = {
  db, workCollection, createHash, randomInt, isSupportedWorkKind, hasResolvedNonExecution,
  assertExternalWorkKind, assertAuthorizedFundingIngress, assertPaymentAuthorizationIngress, compactAuthorizedFundingVerification,
  compactVerificationPayload, createReceivedWork, payloadCommitment, verifiedPayloadForWork,
  decryptPayloadForNode, encryptPayloadForNode, assertNodeVerificationAttestation,
  wakeTsnNode, publishCrankerWake, nativeWorkRetryPatch, snapshotRetryPatch,
};
