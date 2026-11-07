import { createHash, createPublicKey, randomUUID, verify as verifySignature } from "node:crypto";

/** Sender-signed, Node-verified reserve funding and separate settlement work. */
export type WorkKind = "AUTHORIZED_FUNDING" | "SETTLEMENT" | "TIN_OPERATION" | "TCAP_FUNDING_POOL" | "TCAP_EPOCH_ACCOUNTING";
export type WorkStatus =
  | "RECEIVED"
  | "NODE_VERIFYING"
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
  deferredUntil?: string;
  retryHistory?: Record<string, unknown>[];
};

export type PayloadDelta = {
  addedFields: Record<string, unknown>;
  changedFields: Record<string, unknown>;
  removedFields: string[];
};

/** Work kinds that may be accepted from an untrusted HTTP caller. */
export function assertExternalWorkKind(kind: WorkKind): void {
  if (!["AUTHORIZED_FUNDING", "TIN_OPERATION"].includes(kind)) throw new Error(`${kind}_WORK_INTERNAL_ONLY`);
}

const AUTHORIZED_FUNDING_KEYS = new Set([
  "paymentId", "intentSeedHash", "recipientHash", "recipientTin",
  "tokenMintAddress", "amount", "recipientAmount", "senderWallet", "senderAuthorizationMessage",
  "senderAuthorizationSignature", "senderAuthorizationNonce", "senderAuthorizationIssuedAt", "senderAuthorizationExpiresAt",
  "senderFeeAmount", "senderSignedFundingTransaction", "senderFundingMode",
  "fundingNote",
  "destinationNetwork", "destinationExecutor", "destinationToken", "settlementRouteId",
  "source",
]);
const INTERNAL_KEYS: Record<WorkKind, Set<string>> = {
  AUTHORIZED_FUNDING: new Set(["paymentId", "recipientHash", "tokenMintAddress", "amount", "nodeEncryptedPayload"]),
  TCAP_FUNDING_POOL: new Set(["assetEntry", "reserveState", "tcapConfig", "root"]),
  TCAP_EPOCH_ACCOUNTING: new Set(["assetEntry", "reserveState", "tcapConfig", "accountingEpoch"]),
  SETTLEMENT: new Set(["paymentId", "intentId", "recipientHash", "source", "nodeEncryptedPayload"]),
  // Exact private TIN V1 creation payload accepted from the SDK.
  TIN_OPERATION: new Set([
    "intentType", "intentId", "ownerPubkey", "ownerSignature",
    "ownerIntentHash", "ownerIntentMessage", "nonce", "expiry",
    "lookupCommitment", "lookupIssuanceProof", "encryptedIdentityEnvelope",
    "encryptedTinRecovery", "encryptedMasterSeed", "encryptedMetadataHash",
    "routeVersion", "routeNonce", "tipRouteVersion",
    "gpruElgamalKeyVersion", "gpruElgamalPublicKey", "gpruElgamalKeyCommitment",
    "gpruBalanceScanKeyVersion", "gpruBalanceScanPublicKeyX", "gpruBalanceScanPublicKeyY",
    "policyCommitment",
  ]),
};

function assertAllowlisted(value: Record<string, unknown>, allowed: Set<string>, context: string) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`UNSUPPORTED_PAYLOAD_FIELD:${context}.${key}`);
}

function decodeBase58(value: string): Buffer {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("INVALID_SENDER_WALLET");
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) { bytes.unshift(Number(number & 255n)); number >>= 8n; }
  for (const character of value) if (character === "1") bytes.unshift(0); else break;
  const result = Buffer.from(bytes);
  if (result.length !== 32) throw new Error("INVALID_SENDER_WALLET");
  return result;
}

export function assertAuthorizedFundingIngress(payload: Record<string, unknown>): void {
  assertAllowlisted(payload, AUTHORIZED_FUNDING_KEYS, "authorizedFunding");
  if (payload.senderFundingMode !== "tcap_funded_note_v1") throw new Error("FUNDED_NOTE_FUNDING_MODE_REQUIRED");
  const fundingNote = payload.fundingNote;
  if (!fundingNote || typeof fundingNote !== "object" || Array.isArray(fundingNote)) {
    throw new Error("FUNDED_NOTE_PRIVATE_OPENING_REQUIRED");
  }
  const note = fundingNote as Record<string, unknown>;
  assertAllowlisted(note, new Set(["version", "secret", "blinding", "commitment"]), "fundingNote");
  const scalarModulus = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  if (note.version !== 1) throw new Error("INVALID_FUNDED_NOTE_PRIVATE_OPENING");
  for (const field of ["secret", "blinding", "commitment"]) {
    const value = note[field];
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)
        || BigInt(`0x${value}`) >= scalarModulus
        || (field !== "blinding" && BigInt(`0x${value}`) === 0n)) {
      throw new Error("INVALID_FUNDED_NOTE_PRIVATE_OPENING");
    }
  }
  if (typeof payload.senderSignedFundingTransaction !== "string" || !payload.senderSignedFundingTransaction.trim()) {
    throw new Error("OWNER_SIGNED_TCAP_DEPOSIT_REQUIRED");
  }
  // The TCAP transition is Node-owned. Receiver ingress stores the signed
  // payment and reserve deposit first; Node resolves the recipient route and
  // constructs the transition after leasing the work.
  for (const key of ["paymentId", "recipientHash", "recipientTin", "tokenMintAddress", "senderWallet", "senderAuthorizationMessage", "senderAuthorizationSignature", "senderAuthorizationNonce"]) {
    if (typeof payload[key] !== "string" || !String(payload[key]).trim()) throw new Error(`PAYMENT_AUTH_FIELD_REQUIRED:${key}`);
  }
  if (typeof payload.amount !== "number" && typeof payload.amount !== "string") throw new Error("PAYMENT_AUTH_FIELD_REQUIRED:amount");
  let signature: Buffer;
  try {
    signature = Buffer.from(String(payload.senderAuthorizationSignature).replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (signature.length !== 64) throw new Error("INVALID_SENDER_SIGNATURE");
    const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), decodeBase58(String(payload.senderWallet))]), format: "der", type: "spki" });
    if (!verifySignature(null, Buffer.from(String(payload.senderAuthorizationMessage), "utf8"), publicKey, signature)) throw new Error("INVALID_SENDER_SIGNATURE");
  } catch {
    throw new Error("INVALID_SENDER_SIGNATURE");
  }
}

export function assertDurablePayload(kind: WorkKind, payload: Record<string, unknown>): void {
  assertAllowlisted(payload, INTERNAL_KEYS[kind], kind);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function diffPayload(base: Record<string, unknown>, next: Record<string, unknown>): PayloadDelta {
  const addedFields: Record<string, unknown> = {};
  const changedFields: Record<string, unknown> = {};
  const removedFields: string[] = [];
  for (const [key, value] of Object.entries(next)) {
    if (!(key in base)) addedFields[key] = value;
    else if (stable(base[key]) !== stable(value)) changedFields[key] = value;
  }
  for (const key of Object.keys(base)) if (!(key in next)) removedFields.push(key);
  return { addedFields, changedFields, removedFields };
}

/** Store a Node decision and payload differences without a second copy of the work intent. */
export function compactVerificationPayload(
  payload: Record<string, unknown>,
  verification: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const verified = verification?.verifiedPayload;
  if (!verified || typeof verified !== "object" || Array.isArray(verified)) return verification ?? {};
  const { verifiedPayload: _verifiedPayload, ...decision } = verification;
  return {
    ...decision,
    payloadDelta: diffPayload(payload, verified as Record<string, unknown>),
  };
}

export function compactAuthorizedFundingVerification(
  payload: Record<string, unknown>,
  evidence: Record<string, unknown>,
): Record<string, unknown> {
  const verified = evidence.verifiedPayload;
  const verifiedPayload = verified && typeof verified === "object" && !Array.isArray(verified)
    ? Object.fromEntries(
        ["paymentId", "recipientHash", "tokenMintAddress", "amount", "senderSignedFundingTransaction", "senderFundingMode"]
          .filter((key) => (verified as Record<string, unknown>)[key] !== undefined)
          .map((key) => [key, (verified as Record<string, unknown>)[key]]),
      )
    : {};
  return compactVerificationPayload(payload, {
    ...(evidence.verificationType !== undefined ? { verificationType: evidence.verificationType } : {}),
    ...(evidence.nodeAttestation !== undefined ? { nodeAttestation: evidence.nodeAttestation } : {}),
    ...(evidence.programSimulation !== undefined ? { programSimulation: evidence.programSimulation } : {}),
    verifiedPayload,
  });
}

/** Resolve compact current records and legacy records for existing consumers. */
export function verifiedPayloadForWork(work: ReceiverWork): Record<string, unknown> | null {
  const verification = work.verification;
  if (!verification) return null;
  const legacy = verification.verifiedPayload;
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
    return legacy as Record<string, unknown>;
  }
  const delta = verification.payloadDelta as PayloadDelta | undefined;
  if (!delta || typeof delta !== "object") return null;
  const result: Record<string, unknown> = { ...work.payload };
  for (const key of delta.removedFields ?? []) delete result[key];
  Object.assign(result, delta.addedFields ?? {}, delta.changedFields ?? {});
  return result;
}

/** Privacy-filtered fields that the Cranker may execute from Node-verified work. */
export function crankerExecutionPayload(kind: WorkKind, payload: Record<string, unknown>): Record<string, unknown> {
  const allowed = kind === "AUTHORIZED_FUNDING"
    ? new Set(["senderSignedFundingTransaction", "senderFundingMode"])
    : kind === "TCAP_FUNDING_POOL" ? new Set(["tcapFundingPool"])
    : kind === "TCAP_EPOCH_ACCOUNTING" ? new Set(["tcapEpochAccounting"])
    : kind === "SETTLEMENT"
      ? new Set(["tcapCreditTransition"])
      : kind === "TIN_OPERATION"
      ? new Set([
          "intentId", "intentType", "ownerPubkey", "ownerSignature", "ownerIntentHash", "ownerIntentMessage", "ownerSignatureMessageFormat", "expiry",
          "nonce", "lookupCommitment", "encryptedIdentityEnvelope", "encryptedTinRecovery", "encryptedMasterSeed", "encryptedMetadataHash",
          "routeVersion", "routeNonce", "tipRouteVersion",
          "gpruElgamalKeyVersion", "gpruElgamalPublicKey", "gpruElgamalKeyCommitment",
          "gpruBalanceScanKeyVersion", "gpruBalanceScanPublicKeyX", "gpruBalanceScanPublicKeyY",
          "policyCommitment",
        ])
      : new Set<string>();
  const filtered = Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.has(key)));
  if (kind === "SETTLEMENT" && filtered.tcapCreditTransition && typeof filtered.tcapCreditTransition === "object") {
    const transition = filtered.tcapCreditTransition as Record<string, unknown>;
    const allowed = new Set([
      "commitmentRoot", "fundingRootAccount", "previousTcapRoot", "tcapRootSequence", "tokenId", "amountCommitment", "accountingEpoch", "nullifier",
      "validAfterSlot", "expiresAtSlot", "authorizationDigest", "proof", "memoPayload", "memoBodyPayload", "memoLedgerSlots",
      "memoDocument", "memoCommitment", "successorBalancePoint", "assetEntry", "tcapConfig", "reserveState",
    ]);
    const publicTransition = Object.fromEntries(Object.entries(transition).filter(([key]) => allowed.has(key)));
    if (publicTransition.proof && typeof publicTransition.proof === "object" && !Array.isArray(publicTransition.proof)) {
      const allowedProof = new Set(["publicInputs", "proofA", "proofB", "proofC", "actionKind", "tokenId", "amountCommitment", "authorizationCommitment"]);
      publicTransition.proof = Object.fromEntries(Object.entries(publicTransition.proof as Record<string, unknown>).filter(([key]) => allowedProof.has(key)));
    }
    filtered.tcapCreditTransition = publicTransition;
  }
  for (const [coordinationKind,field] of [["TCAP_FUNDING_POOL","tcapFundingPool"],["TCAP_EPOCH_ACCOUNTING","tcapEpochAccounting"]]) {
    const value=filtered[field];
    if(kind!==coordinationKind || !value || typeof value!=="object" || Array.isArray(value))continue;
    const allowed=new Set(["assetEntry","reserveState","tcapConfig",...(kind==="TCAP_FUNDING_POOL"
      ? ["root","eligibleNoteCount","sourceWalletCount","releaseSlot"] : ["accountingEpoch","total","proof"])]);
    const projection=Object.fromEntries(Object.entries(value).filter(([key])=>allowed.has(key)));
    if(projection.proof && typeof projection.proof==="object" && !Array.isArray(projection.proof)) {
      const fields=new Set(["publicInputs","proofA","proofB","proofC"]);
      projection.proof=Object.fromEntries(Object.entries(projection.proof).filter(([key])=>fields.has(key)));
    }
    filtered[field]=projection;
  }
  return filtered;
}

/** Bind authorization to the verified public transition before storing or returning it. */
export function crankerAuthorizationForWork(work: ReceiverWork, authorization: Record<string, unknown>): Record<string, unknown> {
  if (work.kind === "TCAP_FUNDING_POOL" || work.kind === "TCAP_EPOCH_ACCOUNTING") {
    const field = work.kind === "TCAP_FUNDING_POOL" ? "tcapFundingPool" : "tcapEpochAccounting";
    const expected = crankerExecutionPayload(work.kind, verifiedPayloadForWork(work) ?? {})[field];
    const transition = crankerExecutionPayload(work.kind, { [field]: authorization.transition })[field];
    if (authorization.kind !== "TSN_TCAP_COORDINATION_AUTHORIZATION_V1" || !expected || payloadCommitment(expected) !== payloadCommitment(transition)) throw new Error("PRIVATE_COORDINATION_AUTHORIZATION_MISMATCH");
    const allowed = new Set(["kind", "transition", "workStateVersion", "leaseId", "leaseVersion", "leaseExpiresAt", "expiresAtTs"]);
    return { ...Object.fromEntries(Object.entries(authorization).filter(([key]) => allowed.has(key) && key !== "transition")), transition };
  }
  if (/^TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V[12]$/.test(String(authorization.kind))) throw new Error("RETIRED_CREDIT_AUTHORIZATION");
  if (authorization.kind !== "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3") return authorization;
  const received = authorization.transition;
  if (work.kind !== "SETTLEMENT" || !received || typeof received !== "object" || Array.isArray(received)) {
    throw new Error("SETTLEMENT_AUTHORIZATION_TRANSITION_REQUIRED");
  }
  const expected = crankerExecutionPayload("SETTLEMENT", verifiedPayloadForWork(work) ?? {}).tcapCreditTransition;
  const transition = crankerExecutionPayload("SETTLEMENT", { tcapCreditTransition: received }).tcapCreditTransition;
  if (!expected || payloadCommitment(expected) !== payloadCommitment(transition)) {
    throw new Error("SETTLEMENT_AUTHORIZATION_TRANSITION_MISMATCH");
  }
  const allowed = new Set(["kind", "workStateVersion", "leaseId", "leaseVersion", "leaseExpiresAt", "expiresAtTs"]);
  return { ...Object.fromEntries(Object.entries(authorization).filter(([key]) => allowed.has(key))), transition };
}

export function payloadCommitment(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export function createReceivedWork(input: { id?: string; kind: WorkKind; payload: Record<string, unknown>; payloadCommitment?: string }) {
  assertDurablePayload(input.kind, input.payload);
  const now = new Date().toISOString();
  return {
    id: input.id?.trim() || randomUUID(),
    kind: input.kind,
    status: "RECEIVED",
    stateVersion: 1,
    payloadCommitment: input.payloadCommitment ?? payloadCommitment(input.payload),
    payload: input.payload,
    receivedAt: now,
    updatedAt: now,
    nodeLease: null,
    crankerLease: null,
    verification: null,
    result: null,
    authorization: null,
  } satisfies ReceiverWork;
}

export function publicCoordinationPayload(work: ReceiverWork): Record<string, unknown> {
  const payload = verifiedPayloadForWork(work) ?? work.payload;
  const allowed = new Set(["paymentId", "intentId", "recipientHash", "source", "tokenMintAddress", "amount"]);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.has(key)));
}
