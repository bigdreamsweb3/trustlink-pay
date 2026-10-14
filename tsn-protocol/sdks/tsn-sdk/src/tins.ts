import { Buffer } from "buffer";
import { deriveTcapTipRootCommitment, resolveTinGpruCommitment } from "./gpru.js";
import { sha256 } from "@noble/hashes/sha2";
import {
  Connection,
  Ed25519Program,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export const DEFAULT_TIP_PROGRAM_ID =
  "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT";
export const TINS_PROGRAM_SALT = "TINS_SALT_2026";

const TINS_GLOBAL_STATE_SEED = Buffer.from("global-state");
const TINS_V1_CREATE_STAGE_SEED = Buffer.from("tin-v1-create-stage");
const TINS_V1_OWNER_RECOVERY_SEED = Buffer.from("tin-v1-owner-recovery");
const TIN_V1_RECOVERY_V4_MAGIC = Buffer.from("TSNTIN04", "ascii");
const TIN_V1_RECOVERY_V3_MAGIC = Buffer.from("TSNTIN03", "ascii");
const TIN_V1_RECOVERY_V2_MAGIC = Buffer.from("TSNTIN02", "ascii");
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const ZERO_HASH_32 = Buffer.alloc(32);

/**
 * Validate the public portion of a TCap-backed TIN relationship. The
 * privacy-receiving root, snapshot key, and any spend authority remain on the
 * owner device; only these commitments are safe to pass through coordination
 * services.
 */
export function validateTinTcapRelationship(params: {
  tcapRouteVersion: number;
  tcapRelationshipCommitment?: Uint8Array | null;
  tcapRelationshipReference?: Uint8Array | null;
  tcapPolicyCommitment?: Uint8Array | null;
}): boolean {
  const zero = (value?: Uint8Array | null) =>
    !value || value.every((byte) => byte === 0);
  const nonZero32 = (value?: Uint8Array | null) =>
    Boolean(value && value.length === 32 && !zero(value));
  if (params.tcapRouteVersion !== 1) return false;
  return (
    nonZero32(params.tcapRelationshipCommitment) &&
    nonZero32(params.tcapRelationshipReference) &&
    nonZero32(params.tcapPolicyCommitment) &&
    resolveTinGpruCommitment(
      params.tcapRelationshipCommitment!,
      params.tcapRelationshipReference!,
    ) !== null
  );
}
export type TinResolvedIdentity = {
  tin: string;
  name: string;
  authority: PublicKey;
  ownerPubkeyHash: string;
  registry: PublicKey;
  settlementAuthorityVerified: true;
  status: number;
  createdAt: string;
  tcapRouteVersion: 1;
  tcapRelationshipCommitment: string;
  tcapRelationshipReference: string;
  gpruCommitment: string;
  tcapPolicyCommitment: string;
  encryptedMasterSeed: Uint8Array;
};

export function getTinsProgramPublicKey(programId?: PublicKey | string | null) {
  return programId instanceof PublicKey
    ? programId
    : new PublicKey(programId ?? DEFAULT_TIP_PROGRAM_ID);
}

function publishedGpruCommitment(
  commitment: Uint8Array,
  reference: Uint8Array,
): string {
  const gpruCommitment = resolveTinGpruCommitment(commitment, reference);
  if (!gpruCommitment) throw new Error("TIN GPRU commitment does not match the blinded TIP seed");
  return bytesToHex(gpruCommitment);
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(value: Uint8Array) {
  if (value.length === 0) return "";
  const digits = [0];
  for (const byte of value) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const next = digits[index] * 256 + carry;
      digits[index] = next % 58;
      carry = Math.floor(next / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === 0) {
    leadingZeroes += 1;
  }
  return (
    "1".repeat(leadingZeroes) +
    digits
      .reverse()
      .map((digit) => BASE58_ALPHABET[digit])
      .join("")
  );
}

export function getTinsGlobalStatePda(
  programId?: PublicKey | string | null,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TINS_GLOBAL_STATE_SEED],
    getTinsProgramPublicKey(programId),
  )[0];
}

/** PDA that holds one in-progress, owner-authorized staged TIN creation. */
export function getTinV1CreationStagingPda(
  owner: PublicKey,
  intentHash: Uint8Array,
  programId?: PublicKey | string | null,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TINS_V1_CREATE_STAGE_SEED, owner.toBuffer(), normalizeHash32(intentHash, "intentHash")],
    getTinsProgramPublicKey(programId),
  )[0];
}

/** Owner-indexed locator used only for wallet-authorized TIN recovery. */
export function getTinV1OwnerRecoveryPda(
  owner: PublicKey,
  programId?: PublicKey | string | null,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TINS_V1_OWNER_RECOVERY_SEED, owner.toBuffer()],
    getTinsProgramPublicKey(programId),
  )[0];
}

/** Read the encrypted owner recovery envelope from its owner-indexed TIP PDA.
 * The TIN remains encrypted; the wallet signature used to decrypt it stays on
 * the owner's device. */
export async function getTinV1OwnerRecoveryEnvelope(params: {
  connection: Connection;
  ownerPubkey: PublicKey | string;
  programId?: PublicKey | string | null;
}): Promise<Uint8Array | null> {
  const ownerPubkey = params.ownerPubkey instanceof PublicKey
    ? params.ownerPubkey
    : new PublicKey(params.ownerPubkey);
  const programId = getTinsProgramPublicKey(params.programId);
  const [recoveryPda, expectedBump] = PublicKey.findProgramAddressSync(
    [TINS_V1_OWNER_RECOVERY_SEED, ownerPubkey.toBuffer()],
    programId,
  );
  const account = await params.connection.getAccountInfo(recoveryPda, "confirmed");
  if (!account) return null;
  if (!account.owner.equals(programId)) {
    throw new Error("TIN_OWNER_RECOVERY_ACCOUNT_PROGRAM_MISMATCH");
  }

  const data = Buffer.from(account.data);
  const headerLength = 1 + 1 + 32 + 4;
  if (data.length < headerLength) {
    throw new Error("TIN_OWNER_RECOVERY_ACCOUNT_MALFORMED");
  }
  const version = data.readUInt8(0);
  const bump = data.readUInt8(1);
  const storedOwner = data.subarray(2, 34);
  const envelopeLength = data.readUInt32LE(34);
  if (version !== 1 || bump !== expectedBump || !storedOwner.equals(ownerPubkey.toBuffer())) {
    throw new Error("TIN_OWNER_RECOVERY_ACCOUNT_BINDING_MISMATCH");
  }
  if (envelopeLength !== data.length - headerLength) {
    throw new Error("TIN_OWNER_RECOVERY_ACCOUNT_MALFORMED");
  }
  const envelope = new Uint8Array(data.subarray(headerLength));
  // Validate the supported envelope framing before returning it to the caller.
  getTinV1OwnerRecoveryMessageForEnvelope(envelope, ownerPubkey, programId);
  return envelope;
}

/** Canonical wallet-signature message used locally to derive the key for the
 * encrypted TIN recovery record. This signature does not authorize a
 * transaction. */
export function buildTinV1OwnerRecoveryMessage(
  owner: PublicKey | string,
  programId?: PublicKey | string | null,
): Buffer {
  const ownerPubkey = owner instanceof PublicKey ? owner : new PublicKey(owner);
  const tinsProgram = getTinsProgramPublicKey(programId);
  return Buffer.from([
    "TrustLink TIN recovery authorization",
    "Purpose: Recover the encrypted TIN associated with this wallet.",
    "",
    `Wallet: ${ownerPubkey.toBase58()}`,
    `TIN program: ${tinsProgram.toBase58()}`,
    "",
    "This signature is used locally to decrypt the recovery record.",
    "It does not authorize a transaction.",
  ].join("\n"), "utf8");
}

/** Return the same stable message that was signed when the recovery envelope
 * was created. The envelope is checked for a supported TIN V1 format first. */
export function getTinV1OwnerRecoveryMessageForEnvelope(
  encryptedEnvelope: Buffer | Uint8Array,
  owner: PublicKey | string,
  programId?: PublicKey | string | null,
): Buffer {
  const envelope = Buffer.from(encryptedEnvelope);
  const supportedMagic = [
    TIN_V1_RECOVERY_V4_MAGIC,
    TIN_V1_RECOVERY_V3_MAGIC,
    TIN_V1_RECOVERY_V2_MAGIC,
  ].find((magic) => envelope.subarray(0, magic.length).equals(magic));
  if (!supportedMagic || envelope.length < supportedMagic.length + 12 + 16) {
    throw new Error("TIN_OWNER_RECOVERY_ENVELOPE_UNSUPPORTED");
  }
  return buildTinV1OwnerRecoveryMessage(owner, programId);
}

function appendU8(parts: Buffer[], value: number) {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(value);
  parts.push(buffer);
}

function appendU32(parts: Buffer[], value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  parts.push(buffer);
}

function appendBytes(parts: Buffer[], value: Uint8Array) {
  const buffer = Buffer.from(value);
  appendU32(parts, buffer.length);
  parts.push(buffer);
}

function appendPubkey(parts: Buffer[], value: PublicKey) {
  parts.push(value.toBuffer());
}

function appendOptionPubkey(
  parts: Buffer[],
  value: PublicKey | null | undefined,
) {
  appendU8(parts, value ? 1 : 0);
  if (value) appendPubkey(parts, value);
}

function encodeInstruction(tag: number, parts: Buffer[]) {
  return Buffer.concat([Buffer.from([tag]), ...parts]);
}

function normalizeHash32(
  value: Buffer | Uint8Array | undefined,
  label: string,
): Buffer {
  if (!value) return ZERO_HASH_32;
  const buffer = Buffer.from(value);
  if (buffer.length !== 32)
    throw new Error(`${label} must be exactly 32 bytes`);
  return buffer;
}

function requireHash32(
  value: Buffer | Uint8Array | undefined,
  label: string,
): Buffer {
  if (!value) throw new Error(`${label} is required`);
  return normalizeHash32(value, label);
}

function bytesToHex(value: Buffer | Uint8Array) {
  return Buffer.from(value).toString("hex");
}

function appendU64(parts: Buffer[], value: bigint | number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  parts.push(buffer);
}

function appendI64(parts: Buffer[], value: bigint | number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(BigInt(value));
  parts.push(buffer);
}

/**
 * Build the wallet-displayable message for a TIN owner intent.
 *
 * Solana wallets such as Phantom intentionally reject arbitrary binary
 * messages that look like a transaction payload. The owner commitment stays
 * the exact 32-byte `intentHash`; the wallet signs this deterministic UTF-8
 * wrapper, and verifiers bind it to the recomputed commitment.
 */
export function buildTinOwnerIntentMessage(
  intentHash: Buffer | Uint8Array,
): Buffer {
  const normalized = normalizeHash32(intentHash, "intentHash");
  return Buffer.from(
    [
      "TrustLink TIN creation approval",
      "",
      "You are approving the encrypted creation request for your TIN.",
      "",
      "REQUEST DETAILS",
      `Intent reference: ${normalized.toString("hex")}`,
      "",
      "Protocol: Transfer Identity Network",
      "",
      "Version: 1",
      "",
      "NEXT STEP",
      "TSN will verify this approval before submission to Solana.",
      "",
      "No funds are transferred by this approval.",
    ].join("\n"),
    "utf8",
  );
}

export function createOwnerIntentSignatureInstruction(params: {
  ownerPubkey: PublicKey;
  intentHash: Buffer | Uint8Array;
  signature: Buffer | Uint8Array;
  message?: Buffer | Uint8Array;
}) {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: params.ownerPubkey.toBytes(),
    message: params.message
      ? Buffer.from(params.message)
      : normalizeHash32(params.intentHash, "intentHash"),
    signature: Buffer.from(params.signature),
  });
}

/** Serialize a Node-verified CreateTinV1 payload without receiving the lookup
 * secret. Plaintext lookup material remains on the owner side. */
export function serializeTinV1CreationParams(params: {
  ownerPubkey: PublicKey;
  lookupCommitment: Buffer | Uint8Array;
  encryptedTinRecovery: Buffer | Uint8Array;
  encryptedIdentityEnvelope: Buffer | Uint8Array;
  encryptedMasterSeed: Buffer | Uint8Array;
  encryptedMetadataHash: Buffer | Uint8Array;
  routeVersion: bigint | number;
  routeNonce: Buffer | Uint8Array;
  tcapRouteVersion: 1;
  tcapRelationshipCommitment: Buffer | Uint8Array;
  tcapRelationshipReference: Buffer | Uint8Array;
  tcapPolicyCommitment: Buffer | Uint8Array;
  intentHash: Buffer | Uint8Array;
  expiryTs: bigint | number;
}) {
  const lookupCommitment = normalizeHash32(
    params.lookupCommitment,
    "lookupCommitment",
  );
  const routeVersion = Buffer.alloc(8);
  routeVersion.writeBigUInt64LE(BigInt(params.routeVersion));
  if (routeVersion.equals(Buffer.alloc(8)))
    throw new Error("routeVersion must be positive");
  const routeNonce = requireHash32(params.routeNonce, "routeNonce");
  const relationshipCommitment = normalizeHash32(
    params.tcapRelationshipCommitment,
    "tcapRelationshipCommitment",
  );
  const relationshipReference = normalizeHash32(
    params.tcapRelationshipReference,
    "tcapRelationshipReference",
  );
  const policyCommitment = normalizeHash32(
    params.tcapPolicyCommitment,
    "tcapPolicyCommitment",
  );
  if (!validateTinTcapRelationship({
    tcapRouteVersion: params.tcapRouteVersion as 1,
    tcapRelationshipCommitment: relationshipCommitment,
    tcapRelationshipReference: relationshipReference,
    tcapPolicyCommitment: policyCommitment,
  })) throw new Error("TIN creation requires the current GPRU commitment and blinded TIP seed route");
  const body: Buffer[] = [params.ownerPubkey.toBuffer(), lookupCommitment];
  appendBytes(body, params.encryptedTinRecovery);
  appendBytes(body, params.encryptedIdentityEnvelope);
  appendBytes(body, params.encryptedMasterSeed);
  body.push(
    normalizeHash32(params.encryptedMetadataHash, "encryptedMetadataHash"),
  );
  body.push(
    routeVersion,
    routeNonce,
    Buffer.from([params.tcapRouteVersion]),
    relationshipCommitment,
    relationshipReference,
    policyCommitment,
  );
  const expiry = Buffer.alloc(8);
  expiry.writeBigInt64LE(BigInt(params.expiryTs));
  const expectedIntentHash = Buffer.from(
    sha256(
      Buffer.concat([
        Buffer.from("TSN_TIN_V1_CREATE", "utf8"),
        ...body,
        expiry,
      ]),
    ),
  );
  if (
    !expectedIntentHash.equals(requireHash32(params.intentHash, "intentHash"))
  )
    throw new Error("intentHash does not match CreateTinV1 payload");
  return encodeInstruction(17, [...body, expectedIntentHash, expiry]);
}

/** Serialize instruction 19: initialize a bounded, intent-bound TIN V1 stage. */
export function serializeTinV1CreationStageParams(params: {
  ownerPubkey: PublicKey;
  lookupCommitment: Buffer | Uint8Array;
  intentHash: Buffer | Uint8Array;
  encryptedIdentityEnvelopeLength: number;
  encryptedTinRecoveryLength: number;
  encryptedMasterSeedLength: number;
  encryptedMetadataHash: Buffer | Uint8Array;
  routeVersion: bigint | number;
  routeNonce: Buffer | Uint8Array;
  tcapRouteVersion: 1;
  tcapRelationshipCommitment: Buffer | Uint8Array;
  tcapRelationshipReference: Buffer | Uint8Array;
  tcapPolicyCommitment: Buffer | Uint8Array;
  expiryTs: bigint | number;
}) {
  for (const [field, value, required] of [
    ["encryptedIdentityEnvelopeLength", params.encryptedIdentityEnvelopeLength, true],
    ["encryptedTinRecoveryLength", params.encryptedTinRecoveryLength, true],
    ["encryptedMasterSeedLength", params.encryptedMasterSeedLength, true],
  ] as const) {
    if (!Number.isSafeInteger(value) || (required ? value <= 0 : value < 0)) {
      throw new Error(`${field} is invalid`);
    }
  }
  const parts: Buffer[] = [];
  if (!validateTinTcapRelationship({
    tcapRouteVersion: params.tcapRouteVersion as 1,
    tcapRelationshipCommitment: params.tcapRelationshipCommitment,
    tcapRelationshipReference: params.tcapRelationshipReference,
    tcapPolicyCommitment: params.tcapPolicyCommitment,
  })) throw new Error("TIN creation stage requires the current GPRU commitment and blinded TIP seed route");
  appendPubkey(parts, params.ownerPubkey);
  parts.push(
    requireHash32(params.lookupCommitment, "lookupCommitment"),
    requireHash32(params.intentHash, "intentHash"),
  );
  appendU32(parts, params.encryptedIdentityEnvelopeLength);
  appendU32(parts, params.encryptedTinRecoveryLength);
  appendU32(parts, params.encryptedMasterSeedLength);
  parts.push(requireHash32(params.encryptedMetadataHash, "encryptedMetadataHash"));
  appendU64(parts, params.routeVersion);
  parts.push(requireHash32(params.routeNonce, "routeNonce"));
  appendU8(parts, params.tcapRouteVersion);
  parts.push(
    requireHash32(params.tcapRelationshipCommitment, "tcapRelationshipCommitment"),
    requireHash32(params.tcapRelationshipReference, "tcapRelationshipReference"),
    requireHash32(params.tcapPolicyCommitment, "tcapPolicyCommitment"),
  );
  appendI64(parts, params.expiryTs);
  return encodeInstruction(19, parts);
}

/** Serialize instruction 20: append one bounded encrypted-data chunk. */
export function serializeTinV1CreationChunkParams(params: {
  kind: "identity" | "master_seed" | "owner_recovery";
  offset: number;
  bytes: Buffer | Uint8Array;
}) {
  if (!Number.isSafeInteger(params.offset) || params.offset < 0) {
    throw new Error("TIN V1 creation chunk offset must be a non-negative safe integer");
  }
  const parts: Buffer[] = [];
  appendU8(parts, params.kind === "identity" ? 0 : params.kind === "master_seed" ? 1 : 3);
  appendU32(parts, params.offset);
  appendBytes(parts, params.bytes);
  return encodeInstruction(20, parts);
}

/** Serialize instruction 21: finalize by the creation intent hash. */
export function serializeTinV1CreationFinalizeParams(params: {
  intentHash: Buffer | Uint8Array;
}) {
  return encodeInstruction(21, [requireHash32(params.intentHash, "intentHash")]);
}

/** Serialize instruction 22: recover expired staged-creation rent. */
export function serializeTinV1CreationCloseParams(params: {
  intentHash: Buffer | Uint8Array;
}) {
  return encodeInstruction(22, [requireHash32(params.intentHash, "intentHash")]);
}

function getWebCrypto() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle)
    throw new Error("WebCrypto subtle API is required for TIN encryption");
  return cryptoApi;
}

function randomNonce(length = 12) {
  const nonce = new Uint8Array(length);
  getWebCrypto().getRandomValues(nonce);
  return nonce;
}

async function importAesKey(keyMaterial: Uint8Array) {
  return getWebCrypto().subtle.importKey(
    "raw",
    keyMaterial as any,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

/** Build the encrypted identity fields required by CreateTinV1. The TIN is
 * the private lookup material; only its commitment is returned. */
export async function createTinV1IdentityEnvelope(params: {
  tin: bigint | number | string;
  displayName: string;
  /** Protected resolver secret. Never include this value in Receiver work. */
  lookupSecret: Uint8Array | string;
}) {
  if (params.lookupSecret == null) throw new Error("lookupSecret is required for TIN V1 identity creation");
  const secret = typeof params.lookupSecret === "string"
    ? Buffer.from(params.lookupSecret, "utf8")
    : Buffer.from(params.lookupSecret);
  if (secret.length < 16) throw new Error("lookupSecret must contain at least 16 bytes");
  const tin = Buffer.from(String(params.tin), "utf8");
  const lookupCommitment = sha256(
    Buffer.concat([Buffer.from("TSN_TIN_V1_LOOKUP", "utf8"), secret, tin]),
  );
  const identityKey = await importAesKey(
    sha256(
      Buffer.concat([Buffer.from("TSN_TIN_V1_IDENTITY", "utf8"), secret, tin]),
    ),
  );
  const nonce = randomNonce();
  const plaintext = TEXT_ENCODER.encode(
    JSON.stringify({ name: params.displayName, tin: String(params.tin) }),
  );
  const ciphertext = new Uint8Array(
    await getWebCrypto().subtle.encrypt(
      { name: "AES-GCM", iv: nonce as any },
      identityKey,
      plaintext as any,
    ),
  );
  return {
    lookupCommitment,
    encryptedIdentityEnvelope: Buffer.concat([
      Buffer.from(nonce),
      Buffer.from(ciphertext),
    ]),
  };
}

export async function submitTinV1Creation(params: {
  ingressUrl: string;
  prepared: ReturnType<typeof buildTinV1Creation>;
  intentId: string;
  ownerPubkey: PublicKey | string;
  ownerSignature: Uint8Array | string;
  lookupIssuanceProof: string;
  ownerIntentMessage: string;
}) {
  const hex = (value: Uint8Array) => Buffer.from(value).toString("hex");
  const base64 = (value: Uint8Array) => Buffer.from(value).toString("base64");
  const ownerPubkey = typeof params.ownerPubkey === "string"
    ? params.ownerPubkey
    : params.ownerPubkey.toBase58();
  if (!params.ownerIntentMessage.trim()) {
    throw new Error("The signed, human-readable TIN owner intent message is required");
  }
  const ownerSignature = typeof params.ownerSignature === "string"
    ? params.ownerSignature
    : Buffer.from(params.ownerSignature).toString("base64");
  const prepared = params.prepared;
  const response = await fetch(`${params.ingressUrl.replace(/\/$/, "")}/tin-operations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      intentType: "tin_creation",
      intentId: params.intentId,
      ownerPubkey,
      ownerSignature,
      ownerIntentHash: hex(prepared.intentHash),
      ownerIntentMessage: params.ownerIntentMessage,
      nonce: hex(prepared.nonce),
      expiry: Number(prepared.expiryTs),
      lookupCommitment: hex(prepared.lookupCommitment),
      encryptedTinRecovery: base64(prepared.encryptedTinRecovery),
      encryptedIdentityEnvelope: base64(prepared.encryptedIdentityEnvelope),
      encryptedMasterSeed: base64(prepared.encryptedMasterSeed),
      encryptedMetadataHash: hex(prepared.encryptedMetadataHash),
      routeVersion: Number(prepared.routeVersion),
      routeNonce: hex(prepared.routeNonce),
      tcapRouteVersion: prepared.tcapRouteVersion,
      tcapRelationshipCommitment: hex(prepared.tcapRelationshipCommitment),
      tcapRelationshipReference: hex(prepared.tcapRelationshipReference),
      tcapPolicyCommitment: hex(prepared.tcapPolicyCommitment),
      lookupIssuanceProof: params.lookupIssuanceProof,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.detail ?? body?.error ?? `TIN V1 creation rejected (${response.status})`);
  return body;
}

/** Build the canonical owner intent for a private TIN V1 registry record. */
export function createTinV1OwnerIntentHash(params: {
  ownerPubkey: PublicKey;
  lookupCommitment: Buffer | Uint8Array;
  encryptedTinRecovery: Buffer | Uint8Array;
  encryptedIdentityEnvelope: Buffer | Uint8Array;
  encryptedMasterSeed: Buffer | Uint8Array;
  encryptedMetadataHash: Buffer | Uint8Array;
  routeVersion: bigint | number;
  routeNonce: Buffer | Uint8Array;
  tcapRouteVersion: number;
  tcapRelationshipCommitment: Buffer | Uint8Array;
  tcapRelationshipReference: Buffer | Uint8Array;
  tcapPolicyCommitment: Buffer | Uint8Array;
  expiryTs: bigint | number;
}) {
  const routeVersion = Buffer.alloc(8);
  routeVersion.writeBigUInt64LE(BigInt(params.routeVersion));
  if (routeVersion.equals(Buffer.alloc(8))) throw new Error("routeVersion must be positive");
  const expiry = Buffer.alloc(8);
  expiry.writeBigInt64LE(BigInt(params.expiryTs));
  return Buffer.from(sha256(Buffer.concat([
    Buffer.from("TSN_TIN_V1_CREATE", "utf8"),
    params.ownerPubkey.toBuffer(),
    normalizeHash32(params.lookupCommitment, "lookupCommitment"),
    u32LengthPrefixed(params.encryptedTinRecovery),
    u32LengthPrefixed(params.encryptedIdentityEnvelope),
    u32LengthPrefixed(params.encryptedMasterSeed),
    normalizeHash32(params.encryptedMetadataHash, "encryptedMetadataHash"),
    routeVersion,
    requireHash32(params.routeNonce, "routeNonce"),
    Buffer.from([params.tcapRouteVersion]),
    normalizeHash32(params.tcapRelationshipCommitment, "tcapRelationshipCommitment"),
    normalizeHash32(params.tcapRelationshipReference, "tcapRelationshipReference"),
    normalizeHash32(params.tcapPolicyCommitment, "tcapPolicyCommitment"),
    expiry,
  ])));
}

function u32LengthPrefixed(value: Buffer | Uint8Array) {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

/** Prepare a private TIN V1 creation. The raw TIN and lookup secret are used
 * only to create the encrypted envelope and keyed commitment; callers submit
 * the returned payload without either plaintext value. */
export function buildTinV1Creation(params: {
  ownerPubkey: PublicKey;
  lookupCommitment: Buffer | Uint8Array;
  encryptedTinRecovery: Buffer | Uint8Array;
  encryptedIdentityEnvelope: Buffer | Uint8Array;
  encryptedMasterSeed: Buffer | Uint8Array;
  encryptedMetadataHash?: Buffer | Uint8Array;
  routeVersion?: bigint | number;
  routeNonce?: Buffer | Uint8Array;
  tcapRouteVersion: number;
  tcapRelationshipCommitment: Buffer | Uint8Array;
  tcapRelationshipReference: Buffer | Uint8Array;
  tcapPolicyCommitment: Buffer | Uint8Array;
  expiryTs?: bigint | number;
  nonce?: Buffer | Uint8Array;
}) {
  if (params.tcapRouteVersion !== 1) throw new Error("TIN V1 creation requires the active TCap route version");
  const gpruCommitment = Buffer.from(params.tcapRelationshipCommitment);
  const tipRootCommitment = Buffer.from(params.tcapRelationshipReference);
  if (!Buffer.from(deriveTcapTipRootCommitment(gpruCommitment)).equals(tipRootCommitment)) {
    throw new Error("TIN route must store the GPRU public commitment separately from its blinded TCAP TIP seed");
  }
  const zero = Buffer.alloc(32);
  const nonce = Buffer.from(params.nonce ?? params.routeNonce ?? randomNonce(32));
  if (nonce.length !== 32) throw new Error("nonce must be 32 bytes");
  const routeNonce = Buffer.from(params.routeNonce ?? nonce);
  if (routeNonce.length !== 32) throw new Error("routeNonce must be 32 bytes");
  if (!routeNonce.equals(nonce)) throw new Error("nonce must equal the signed routeNonce");
  const routeVersion = BigInt(params.routeVersion ?? 1);
  const expiryTs = BigInt(params.expiryTs ?? Math.floor(Date.now() / 1000) + 900);
  const encryptedMetadataHash = Buffer.from(params.encryptedMetadataHash ?? zero);
  const fields = {
    ownerPubkey: params.ownerPubkey,
    lookupCommitment: params.lookupCommitment,
    encryptedTinRecovery: params.encryptedTinRecovery,
    encryptedIdentityEnvelope: params.encryptedIdentityEnvelope,
    encryptedMasterSeed: params.encryptedMasterSeed,
    encryptedMetadataHash,
    routeVersion,
    routeNonce,
    tcapRouteVersion: params.tcapRouteVersion as 1,
    tcapRelationshipCommitment: params.tcapRelationshipCommitment,
    tcapRelationshipReference: params.tcapRelationshipReference,
    tcapPolicyCommitment: params.tcapPolicyCommitment,
    expiryTs,
  };
  const intentHash = createTinV1OwnerIntentHash(fields);
  const instructionData = serializeTinV1CreationParams({ ...fields, intentHash });
  return { ...fields, nonce, intentHash, instructionData };
}

async function resolvePrivateTinRecord(params: {
  tin: bigint | number | string;
  connection: Connection;
  programId?: PublicKey | string | null;
  lookupSecret: Uint8Array | string;
}): Promise<TinResolvedIdentity> {
  const programId = getTinsProgramPublicKey(params.programId);
  const secret = params.lookupSecret
    ? typeof params.lookupSecret === "string"
      ? Buffer.from(params.lookupSecret, "utf8")
      : Buffer.from(params.lookupSecret)
    : Buffer.alloc(0);
  if (secret.length < 16) throw new Error("lookupSecret must contain at least 16 bytes");
  const lookupCommitment = Buffer.from(
    sha256(
      Buffer.concat([
        Buffer.from("TSN_TIN_V1_LOOKUP", "utf8"),
        secret,
        Buffer.from(String(params.tin), "utf8"),
      ]),
    ),
  );
  const registry = PublicKey.findProgramAddressSync(
    [Buffer.from("tin-v1", "utf8"), lookupCommitment],
    programId,
  )[0];
  const account = await params.connection.getAccountInfo(registry);
  if (!account || !account.owner.equals(programId))
    throw new Error(
      `TIN ${String(params.tin)} was not found in the private registry`,
    );

  const buffer = Buffer.from(account.data);
  let offset = 0;
  const readU8 = () => buffer.readUInt8(offset++);
  const readU32 = () => {
    const value = buffer.readUInt32LE(offset);
    offset += 4;
    return value;
  };
  const readBytes = () => {
    const length = readU32();
    const value = buffer.subarray(offset, offset + length);
    offset += length;
    return value;
  };
  const readFixed = (length: number) => {
    const value = buffer.subarray(offset, offset + length);
    offset += length;
    return value;
  };
  const version = readU8();
  const bump = readU8();
  const status = readU8();
  readFixed(5);
  const storedLookup = readFixed(32);
  const ownerCommitment = readFixed(32);
  const encryptedIdentityEnvelope = readBytes();
  const encryptedMasterSeed = readBytes();
  const createdAt = buffer.readBigInt64LE(offset);
  offset += 8;
  const encryptedMetadataHash = readFixed(32);
  const routeVersion = buffer.readBigUInt64LE(offset);
  offset += 8;
  const routeNonce = readFixed(32);
  const tcapRouteVersion = readU8();
  const tcapRelationshipCommitment = readFixed(32);
  const tcapRelationshipReference = readFixed(32);
  const tcapPolicyCommitment = readFixed(32);
  if (
    version !== 1 ||
    status !== 1 ||
    !Buffer.from(storedLookup).equals(lookupCommitment) ||
    offset > buffer.length ||
    buffer.subarray(offset).some((byte) => byte !== 0)
  ) {
    throw new Error("unsupported private TIN account schema");
  }
  if (routeVersion !== 1n || !validateTinTcapRelationship({
    tcapRouteVersion,
    tcapRelationshipCommitment,
    tcapRelationshipReference,
    tcapPolicyCommitment,
  })) {
    throw new Error("private TIN route does not match the current GPRU commitment schema");
  }
  if (encryptedIdentityEnvelope.length < 13)
    throw new Error("private TIN identity envelope is invalid");
  const identityKey = await importAesKey(
    sha256(
      Buffer.concat([
        Buffer.from("TSN_TIN_V1_IDENTITY", "utf8"),
        secret,
        Buffer.from(String(params.tin), "utf8"),
      ]),
    ),
  );
  const identityPlaintext = await getWebCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: encryptedIdentityEnvelope.subarray(0, 12) as any },
    identityKey,
    encryptedIdentityEnvelope.subarray(12) as any,
  );
  const identity = JSON.parse(TEXT_DECODER.decode(identityPlaintext)) as {
    name?: string;
    tin?: string;
  };
  if (identity.tin !== String(params.tin) || typeof identity.name !== "string")
    throw new Error("private TIN identity disclosure is invalid");
  return {
    tin: String(params.tin),
    name: identity.name,
    authority: registry,
    ownerPubkeyHash: bytesToHex(ownerCommitment),
    registry,
    settlementAuthorityVerified: true,
    status,
    createdAt: createdAt.toString(),
    tcapRouteVersion: 1,
    tcapRelationshipCommitment: bytesToHex(tcapRelationshipCommitment),
    tcapRelationshipReference: bytesToHex(tcapRelationshipReference),
    gpruCommitment: publishedGpruCommitment(
      tcapRelationshipCommitment,
      tcapRelationshipReference,
    ),
    tcapPolicyCommitment: bytesToHex(tcapPolicyCommitment),
    encryptedMasterSeed: new Uint8Array(encryptedMasterSeed),
  };
}

export async function resolveTIN(params: {
  tin: bigint | number | string;
  connection: Connection;
  programId?: PublicKey | string | null;
  lookupSecret: Uint8Array | string;
}): Promise<TinResolvedIdentity> {
  return resolvePrivateTinRecord({
    tin: params.tin,
    connection: params.connection,
    programId: params.programId,
    lookupSecret: params.lookupSecret,
  });
}

/**
 * Resolve the public payment-route commitments for a TIN through the TSN SDK.
 * Application code supplies an RPC URL instead of constructing a Solana client
 * or importing TIP program helpers directly.
 */
export async function resolveTinRoute(params: {
  tin: bigint | number | string;
  rpcUrl: string;
  programId?: PublicKey | string | null;
  lookupSecret: Uint8Array | string;
}): Promise<TinResolvedIdentity> {
  return resolveTIN({
    tin: params.tin,
    connection: new Connection(params.rpcUrl, "confirmed"),
    programId: params.programId,
    lookupSecret: params.lookupSecret,
  });
}
