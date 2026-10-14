import { createHash, createPublicKey, randomUUID, verify as verifySignature } from "node:crypto";

/** Sender-signed, Node-verified epoch-treasury funding work. */
export type WorkKind = "AUTHORIZED_FUNDING" | "SETTLEMENT" | "TIN_OPERATION";
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
};

export type PayloadDelta = {
  addedFields: Record<string, unknown>;
  changedFields: Record<string, unknown>;
  removedFields: string[];
};

/** Work kinds that may be accepted from an untrusted HTTP caller. */
export function assertExternalWorkKind(kind: WorkKind): void {
  if (kind === "SETTLEMENT") throw new Error(`${kind}_WORK_INTERNAL_ONLY`);
}

const AUTHORIZED_FUNDING_KEYS = new Set([
  "paymentId", "intentSeedHash", "recipientHash", "recipientTin", "recipientRouteCommitment", "recipientRouteVersion",
  "tokenMintAddress", "amount", "recipientAmount", "underlyingPayment", "senderWallet", "senderAuthorizationMessage",
  "senderAuthorizationSignature", "senderAuthorizationNonce", "senderAuthorizationIssuedAt", "senderAuthorizationExpiresAt",
  "senderFeeAmount", "senderSignedFundingTransaction", "senderFundingMode",
  "pruSpendTin", "pruSpendAmountBaseUnits", "pruSpendSenderFeeBaseUnits", "walletTopUpAmountBaseUnits",
  "walletTopUpSenderFeeBaseUnits", "pruSpendSelections", "privacyVersion", "senderTokenAccount",
  "transferId", "commitmentHash",
  "settlementEpoch", "encryptedSettlementToken", "source", "tcapCreditTransition",
]);
const INTERNAL_KEYS: Record<WorkKind, Set<string>> = {
  AUTHORIZED_FUNDING: new Set(["paymentId", "recipientHash", "privacyVersion", "tokenMintAddress", "amount", "recipientRouteCommitment", "recipientRouteVersion", "nodeEncryptedPayload"]),
  SETTLEMENT: new Set(["paymentId", "intentId", "recipientHash", "source", "nodeEncryptedPayload"]),
  // Private TIN V1 payload accepted from the SDK. Plaintext TIN, display name,
  // and resolver secret are excluded; the Node verifies signature, hash,
  // expiry, issuer proof, and route commitments.
  TIN_OPERATION: new Set([
    "intentType", "ownerPubkey", "ownerSignature", "ownerIntentHash",
    "ownerIntentMessage", "nonce", "expiry", "displayName", "encryptedMasterSeed",
    "encryptedMetadataHash",
    "routeVersion", "routeNonce", "tcapRouteVersion", "tcapRelationshipCommitment",
    "tcapRelationshipReference", "tcapPolicyCommitment", "tin", "lookupCommitment", "lookupIssuanceProof",
    "encryptedIdentityEnvelope", "encryptedTinRecovery", "intentId", "intent_id", "source",
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
  if (payload.senderFundingMode !== "tcap_deposit_v2") throw new Error("LEGACY_FUNDING_MODE_RETIRED_TCAP_DEPOSIT_V2_REQUIRED");
  if (typeof payload.senderSignedFundingTransaction !== "string" || !payload.senderSignedFundingTransaction.trim()) {
    throw new Error("OWNER_SIGNED_TCAP_DEPOSIT_REQUIRED");
  }
  if (!payload.tcapCreditTransition || typeof payload.tcapCreditTransition !== "object" || Array.isArray(payload.tcapCreditTransition)) {
    throw new Error("TCAP_V2_CREDIT_TRANSITION_REQUIRED");
  }
  for (const key of ["paymentId", "recipientHash", "recipientRouteCommitment", "tokenMintAddress", "senderWallet", "senderAuthorizationMessage", "senderAuthorizationSignature", "senderAuthorizationNonce"]) {
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
    : kind === "SETTLEMENT"
      ? new Set(["tcapCreditTransition"])
      : kind === "TIN_OPERATION"
      ? new Set([
          "intentId", "intentType", "ownerPubkey", "ownerSignature", "ownerIntentHash", "ownerIntentMessage", "ownerSignatureMessageFormat", "expiry",
          "nonce", "displayName", "lookupCommitment", "encryptedIdentityEnvelope", "encryptedTinRecovery", "encryptedMasterSeed", "encryptedMetadataHash",
          "routeVersion", "routeNonce", "tcapRouteVersion",
          "tcapRelationshipCommitment", "tcapRelationshipReference", "tcapPolicyCommitment",
        ])
      : new Set<string>();
  const filtered = Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.has(key)));
  if (kind === "SETTLEMENT" && filtered.tcapCreditTransition && typeof filtered.tcapCreditTransition === "object") {
    const transition = filtered.tcapCreditTransition as Record<string, unknown>;
    filtered.tcapCreditTransition = Object.fromEntries(Object.entries(transition).filter(([key]) => new Set([
      "tipRootCommitment", "previousCommitment", "newCommitment", "sequence", "tokenId",
      "amountBaseUnits", "depositAmountBaseUnits", "mint", "policyCommitment", "gpruScopeCommitment", "nullifier", "validAfterSlot",
      "expiresAtSlot", "authorizationDigest", "gpruCreditEnvelopeBase64", "gpruCreditNonceBase64", "recipientPrivacyKeyCommitment",
      "depositAccounts", "assetEntry", "tcapConfig",
    ]).has(key)));
  }
  return filtered;
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
  const allowed = new Set(["paymentId", "recipientHash", "privacyVersion", "tokenMintAddress", "amount", "recipientRouteCommitment", "recipientRouteVersion", "transferId", "commitmentHash", "settlementEpoch"]);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.has(key)));
}
