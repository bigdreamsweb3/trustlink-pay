/** Sender-signed, Node-verified reserve funding and separate settlement work. */
export type WorkKind = "AUTHORIZED_FUNDING" | "SETTLEMENT" | "TIN_DEBIT" | "TIN_OPERATION" | "TCAP_EPOCH_ACCOUNTING";

export type WorkStatus =
  | "RECEIVED"
  | "NODE_VERIFYING"
  | "FUNDING_READY"
  | "VERIFIED"
  | "REJECTED"
  | "CRANKER_LEASED"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED";

export type ReceiverWork = {
  id: string;
  kind: WorkKind;
  status: WorkStatus;
  stateVersion: number;
  payloadCommitment: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  updatedAt: string;
  nodeLease?: { owner: string; expiresAt: string; leaseId?: string; version?: number } | null;
  crankerLease?: { owner: string; expiresAt: string; leaseId?: string; version?: number } | null;
  verification?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  authorization?: Record<string, unknown> | null;
  fundingPhase?: "AUTHORIZATION" | "SIGNED_DEPOSIT";
  authorizationPayloadCommitment?: string;
  fundingReadiness?: { expiresAt: string; authorizationPayloadCommitment: string; nodeEncryptedPreflight: Record<string, unknown> };
  fundingReadinessAttestation?: Record<string, unknown>;
  fundingReadinessReceiverLease?: Record<string, unknown>;
  authorizationPreflight?: Record<string, unknown>;
  fundingAttachmentCommitment?: string;
  deferredUntil?: string;
  retryHistory?: Record<string, unknown>[];
  nonExecutionResolution?: Record<string, unknown>;
  nonExecutionHistory?: Record<string, unknown>[];
};

export type PayloadDelta = {
  addedFields: Record<string, unknown>;
  changedFields: Record<string, unknown>;
  removedFields: string[];
};

/** Issuing bank context for the exact owner-signed funding transaction. */
export type SenderFundingBlockhashContext = {
  blockhash: string;
  lastValidBlockHeight: number;
  contextSlot: number;
};

export type SignedFundingAttachment = {
  id: string;
  expectedVersion: number;
  authorizationPayloadCommitment: string;
  senderSignedFundingTransaction: string;
  senderFundingBlockhashContext: SenderFundingBlockhashContext;
};

/** Native clock and entropy port used by work creation; defaults preserve the public facade. */
export type WorkCreationDependencies = {
  clock: new () => Date;
  randomUUID: () => string;
};
