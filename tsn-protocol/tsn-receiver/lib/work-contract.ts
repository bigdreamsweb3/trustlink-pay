import { createHash, createPublicKey, randomUUID, verify as verifySignature } from "node:crypto";

export type WorkKind = "PAYMENT_INTENT" | "CLAIM" | "TIN_OPERATION" | "RECOVERY";
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

/** Work kinds that may be accepted from an untrusted HTTP caller. */
export function assertExternalWorkKind(kind: WorkKind): void {
  if (kind === "CLAIM" || kind === "RECOVERY") {
    throw new Error(`${kind}_WORK_INTERNAL_ONLY`);
  }
}

const PAYMENT_INTENT_KEYS = new Set([
  "paymentId", "intentSeedHash", "recipientHash", "recipientTin", "recipientRouteCommitment", "recipientRouteVersion",
  "tokenMintAddress", "amount", "recipientAmount", "underlyingPayment", "senderWallet", "senderAuthorizationMessage",
  "senderAuthorizationSignature", "senderAuthorizationNonce", "senderAuthorizationIssuedAt", "senderAuthorizationExpiresAt",
  "senderFeeAmount", "senderSignedSettlementTransaction", "senderSignedSettlementFeePayer", "senderSettlementMode",
  "pruSpendTin", "pruSpendAmountBaseUnits", "pruSpendSenderFeeBaseUnits", "walletTopUpAmountBaseUnits",
  "walletTopUpSenderFeeBaseUnits", "pruSpendSelections", "privacyVersion", "commitmentRecord", "senderTokenAccount",
  "settlementVault", "settlementTokenAccount", "settlementPaymentIntentId", "transferId", "commitmentHash",
  "settlementEpoch", "encryptedSettlementToken", "source",
]);
const INTERNAL_KEYS: Record<WorkKind, Set<string>> = {
  PAYMENT_INTENT: new Set(["paymentId", "recipientHash", "privacyVersion", "tokenMintAddress", "amount", "recipientRouteCommitment", "recipientRouteVersion", "nodeEncryptedPayload"]),
  CLAIM: new Set(["paymentId", "intentId", "recipientHash", "source"]),
  RECOVERY: new Set(["paymentId", "intentId", "claimId", "fundingSignature", "payoutSignature", "payoutNullifier", "commitmentHash", "escrowTokenAccount", "tokenMintAddress", "recoveryAmountBaseUnits", "source"]),
  TIN_OPERATION: new Set(["operationId", "intentType", "ownerPubkey", "tin", "nonce", "payload", "source"]),
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

export function assertPaymentIntentIngress(payload: Record<string, unknown>): void {
  assertAllowlisted(payload, PAYMENT_INTENT_KEYS, "paymentIntent");
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
  const payload = work.verification?.verifiedPayload && typeof work.verification.verifiedPayload === "object"
    ? work.verification.verifiedPayload as Record<string, unknown> : work.payload;
  const allowed = new Set(["paymentId", "recipientHash", "privacyVersion", "tokenMintAddress", "amount", "recipientRouteCommitment", "recipientRouteVersion", "transferId", "commitmentHash", "settlementEpoch"]);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.has(key)));
}
