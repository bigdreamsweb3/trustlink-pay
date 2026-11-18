import type { createHash, randomInt } from "node:crypto";
import type { isSupportedWorkKind, hasResolvedNonExecution, assertExternalWorkKind, assertAuthorizedFundingIngress, compactAuthorizedFundingVerification, compactVerificationPayload, createReceivedWork, payloadCommitment, verifiedPayloadForWork } from "../work-contract";
import type { decryptPayloadForNode, encryptPayloadForNode } from "../node-envelope";
import type { assertNodeVerificationAttestation } from "../node-verification";
import type { wakeTsnNode } from "../node-wake";
import type { publishCrankerWake } from "../cranker-wake";
import type { nativeWorkRetryPatch } from "../native-work-retry";
import type { snapshotRetryPatch } from "../settlement-retry";
import type { assertPaymentAuthorizationIngress } from "../work-contract";

/** Actual persistence operations required by Receiver work; not a Firestore-wide service locator. */
export interface DocumentPort {
  readonly id: string;
  get(): Promise<SnapshotPort>;
}
export interface SnapshotPort {
  readonly id: string;
  readonly ref: DocumentPort;
  readonly exists: boolean;
  data(): any;
  get(field: string): any;
}
export interface QueryPort {
  where(field: string, operator: string, value: unknown): QueryPort;
  orderBy(field: string, direction?: string): QueryPort;
  limit(value: number): QueryPort;
  startAfter(snapshot: SnapshotPort): QueryPort;
  get(): Promise<{ docs: SnapshotPort[] }>;
}
export interface CollectionPort extends QueryPort {
  doc(id: string): DocumentPort;
}
export interface TransactionPort {
  get(reference: DocumentPort): Promise<SnapshotPort>;
  create(reference: DocumentPort, value: unknown): void;
  set(reference: DocumentPort, value: unknown): void;
  update(reference: DocumentPort, value: unknown): void;
}
export interface DatabasePort {
  collection(name: string): CollectionPort;
  runTransaction<T>(operation: (transaction: TransactionPort) => Promise<T>): Promise<T>;
}
export interface WorkDependencies {
  db: DatabasePort;
  workCollection: CollectionPort;
  createHash: typeof createHash;
  randomInt: typeof randomInt;
  isSupportedWorkKind: typeof isSupportedWorkKind;
  hasResolvedNonExecution: typeof hasResolvedNonExecution;
  assertExternalWorkKind: typeof assertExternalWorkKind;
  assertAuthorizedFundingIngress: typeof assertAuthorizedFundingIngress;
  assertPaymentAuthorizationIngress: typeof assertPaymentAuthorizationIngress;
  compactAuthorizedFundingVerification: typeof compactAuthorizedFundingVerification;
  compactVerificationPayload: typeof compactVerificationPayload;
  createReceivedWork: typeof createReceivedWork;
  payloadCommitment: typeof payloadCommitment;
  verifiedPayloadForWork: typeof verifiedPayloadForWork;
  decryptPayloadForNode: typeof decryptPayloadForNode;
  encryptPayloadForNode: typeof encryptPayloadForNode;
  assertNodeVerificationAttestation: typeof assertNodeVerificationAttestation;
  wakeTsnNode: typeof wakeTsnNode;
  publishCrankerWake: typeof publishCrankerWake;
  nativeWorkRetryPatch: typeof nativeWorkRetryPatch;
  snapshotRetryPatch: typeof snapshotRetryPatch;
}
