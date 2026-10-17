import { Buffer } from "buffer";
import { deriveTipRootCommitment, resolveTinGpruPublicCommitment } from "./gpru.js";
import { sha256 } from "@noble/hashes/sha2";
import nacl from "tweetnacl";
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
const TIN_V1_RECOVERY_KEY_DOMAIN = Buffer.from("TSN_TIN_OWNER_RECOVERY_KEY_V1", "utf8");
const TIN_V1_RECOVERY_V2_MAGIC = Buffer.from("TSNTIN02", "ascii");
const TEXT_ENCODER = new TextEncoder();
const ZERO_HASH_32 = Buffer.alloc(32);

/**
 * Validate the public TIP route associated with a TIN. The
 * privacy-receiving root, snapshot key, and any spend authority remain on the
 * owner device; only these commitments are safe to pass through coordination
 * services.
 */
export function validateTinTipRoute(params: {
  tipRouteVersion: number;
  gpruPublicCommitment?: Uint8Array | null;
  tipRootCommitment?: Uint8Array | null;
  policyCommitment?: Uint8Array | null;
}): boolean {
  const zero = (value?: Uint8Array | null) =>
    !value || value.every((byte) => byte === 0);
  const nonZero32 = (value?: Uint8Array | null) =>
    Boolean(value && value.length === 32 && !zero(value));
  if (params.tipRouteVersion !== 1) return false;
  return (
    nonZero32(params.gpruPublicCommitment) &&
    nonZero32(params.tipRootCommitment) &&
    nonZero32(params.policyCommitment) &&
    resolveTinGpruPublicCommitment(
      params.gpruPublicCommitment!,
      params.tipRootCommitment!,
    ) !== null
  );
}
export function getTinsProgramPublicKey(programId?: PublicKey | string | null) {
  return programId instanceof PublicKey
    ? programId
    : new PublicKey(programId ?? DEFAULT_TIP_PROGRAM_ID);
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

function tinRecoveryKeyContext(owner: PublicKey | string, programId?: PublicKey | string | null) {
  const ownerPubkey = owner instanceof PublicKey ? owner : new PublicKey(owner);
  return Buffer.concat([ownerPubkey.toBuffer(), getTinsProgramPublicKey(programId).toBuffer()]);
}

async function importTinRecoveryKey(
  owner: PublicKey | string,
  signature: Buffer | Uint8Array,
  programId?: PublicKey | string | null,
) {
  const ownerPubkey = owner instanceof PublicKey ? owner : new PublicKey(owner);
  const message = buildTinV1OwnerRecoveryMessage(ownerPubkey, programId);
  const signatureBytes = Buffer.from(signature);
  if (!nacl.sign.detached.verify(message, signatureBytes, ownerPubkey.toBytes())) {
    throw new Error("TIN_OWNER_RECOVERY_SIGNATURE_INVALID");
  }
  const keyMaterial = sha256(Buffer.concat([
    TIN_V1_RECOVERY_KEY_DOMAIN,
    tinRecoveryKeyContext(ownerPubkey, programId),
    signatureBytes,
  ]));
  return importAesKey(keyMaterial);
}

/** Encrypt a new owner's TIN locally for the owner-indexed recovery PDA. */
export async function createTinV1OwnerRecoveryEnvelope(params: {
  tin: string;
  displayName: string;
  owner: PublicKey | string;
  signature: Buffer | Uint8Array;
  programId?: PublicKey | string | null;
}): Promise<Uint8Array> {
  if (!/^\d{10}$/.test(params.tin)) throw new Error("TIN_OWNER_RECOVERY_TIN_INVALID");
  const displayName = params.displayName.trim();
  if (!displayName || displayName.length > 100 || /[\r\n\u0000-\u001f\u007f]/u.test(displayName)) {
    throw new Error("TIN_OWNER_RECOVERY_DISPLAY_NAME_INVALID");
  }
  const key = await importTinRecoveryKey(params.owner, params.signature, params.programId);
  const nonce = randomNonce(12);
  const plaintext = TEXT_ENCODER.encode(JSON.stringify({ tin: params.tin, displayName }));
  const ciphertext = new Uint8Array(await getWebCrypto().subtle.encrypt(
    { name: "AES-GCM", iv: nonce as any },
    key,
    plaintext as any,
  ));
  return Buffer.concat([TIN_V1_RECOVERY_V4_MAGIC, Buffer.from(nonce), Buffer.from(ciphertext)]);
}

/** Decrypt the owner-recovery record locally after wallet signing. */
export async function decryptTinV1OwnerRecoveryEnvelope(params: {
  encryptedEnvelope: Buffer | Uint8Array;
  owner: PublicKey | string;
  signature: Buffer | Uint8Array;
  programId?: PublicKey | string | null;
}): Promise<{ tin: string; displayName?: string }> {
  const envelope = Buffer.from(params.encryptedEnvelope);
  const magic = [TIN_V1_RECOVERY_V4_MAGIC, TIN_V1_RECOVERY_V3_MAGIC, TIN_V1_RECOVERY_V2_MAGIC]
    .find((candidate) => envelope.subarray(0, candidate.length).equals(candidate));
  if (!magic || envelope.length < magic.length + 12 + 16) {
    throw new Error("TIN_OWNER_RECOVERY_ENVELOPE_UNSUPPORTED");
  }
  const key = await importTinRecoveryKey(params.owner, params.signature, params.programId);
  const nonceStart = magic.length;
  const plaintext = await getWebCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: envelope.subarray(nonceStart, nonceStart + 12) as any },
    key,
    envelope.subarray(nonceStart + 12) as any,
  );
  const decoded = new TextDecoder().decode(plaintext);
  const isJsonEnvelope = magic.equals(TIN_V1_RECOVERY_V4_MAGIC) || magic.equals(TIN_V1_RECOVERY_V3_MAGIC);
  let identity: { tin?: unknown; displayName?: unknown };
  try {
    identity = isJsonEnvelope ? JSON.parse(decoded) : { tin: decoded };
  } catch {
    throw new Error("TIN_OWNER_RECOVERY_ENVELOPE_MALFORMED");
  }
  if (typeof identity.tin !== "string" || !/^\d{10}$/.test(identity.tin)) {
    throw new Error("TIN_OWNER_RECOVERY_TIN_INVALID");
  }
  if (isJsonEnvelope && (typeof identity.displayName !== "string" || !identity.displayName.trim())) {
    throw new Error("TIN_OWNER_RECOVERY_DISPLAY_NAME_INVALID");
  }
  return {
    tin: identity.tin,
    ...(typeof identity.displayName === "string" ? { displayName: identity.displayName } : {}),
  };
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
      "Protocol: Transfer Identity Protocol (TIP)",
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
      : buildTinOwnerIntentMessage(params.intentHash),
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
  tipRouteVersion: 1;
  gpruPublicCommitment: Buffer | Uint8Array;
  tipRootCommitment: Buffer | Uint8Array;
  policyCommitment: Buffer | Uint8Array;
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
  const gpruPublicCommitment = normalizeHash32(
    params.gpruPublicCommitment,
    "gpruPublicCommitment",
  );
  const tipRootCommitment = normalizeHash32(
    params.tipRootCommitment,
    "tipRootCommitment",
  );
  const policyCommitment = normalizeHash32(
    params.policyCommitment,
    "policyCommitment",
  );
  if (!validateTinTipRoute({
    tipRouteVersion: params.tipRouteVersion as 1,
    gpruPublicCommitment,
    tipRootCommitment,
    policyCommitment,
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
    Buffer.from([params.tipRouteVersion]),
    gpruPublicCommitment,
    tipRootCommitment,
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
  tipRouteVersion: 1;
  gpruPublicCommitment: Buffer | Uint8Array;
  tipRootCommitment: Buffer | Uint8Array;
  policyCommitment: Buffer | Uint8Array;
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
  if (!validateTinTipRoute({
    tipRouteVersion: params.tipRouteVersion as 1,
    gpruPublicCommitment: params.gpruPublicCommitment,
    tipRootCommitment: params.tipRootCommitment,
    policyCommitment: params.policyCommitment,
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
  appendU8(parts, params.tipRouteVersion);
  parts.push(
    requireHash32(params.gpruPublicCommitment, "gpruPublicCommitment"),
    requireHash32(params.tipRootCommitment, "tipRootCommitment"),
    requireHash32(params.policyCommitment, "policyCommitment"),
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
      tipRouteVersion: prepared.tipRouteVersion,
      gpruPublicCommitment: hex(prepared.gpruPublicCommitment),
      tipRootCommitment: hex(prepared.tipRootCommitment),
      policyCommitment: hex(prepared.policyCommitment),
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
  tipRouteVersion: number;
  gpruPublicCommitment: Buffer | Uint8Array;
  tipRootCommitment: Buffer | Uint8Array;
  policyCommitment: Buffer | Uint8Array;
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
    Buffer.from([params.tipRouteVersion]),
    normalizeHash32(params.gpruPublicCommitment, "gpruPublicCommitment"),
    normalizeHash32(params.tipRootCommitment, "tipRootCommitment"),
    normalizeHash32(params.policyCommitment, "policyCommitment"),
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
  tipRouteVersion: number;
  gpruPublicCommitment: Buffer | Uint8Array;
  tipRootCommitment: Buffer | Uint8Array;
  policyCommitment: Buffer | Uint8Array;
  expiryTs?: bigint | number;
  nonce?: Buffer | Uint8Array;
}) {
  if (params.tipRouteVersion !== 1) throw new Error("TIN V1 creation requires the active TIP route version");
  const gpruPublicCommitment = Buffer.from(params.gpruPublicCommitment);
  const tipRootCommitment = Buffer.from(params.tipRootCommitment);
  if (!Buffer.from(deriveTipRootCommitment(gpruPublicCommitment)).equals(tipRootCommitment)) {
    throw new Error("TIP route must store the GPRU public commitment separately from its blinded TIP seed");
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
    tipRouteVersion: params.tipRouteVersion as 1,
    gpruPublicCommitment: params.gpruPublicCommitment,
    tipRootCommitment: params.tipRootCommitment,
    policyCommitment: params.policyCommitment,
    expiryTs,
  };
  const intentHash = createTinV1OwnerIntentHash(fields);
  const instructionData = serializeTinV1CreationParams({ ...fields, intentHash });
  return { ...fields, nonce, intentHash, instructionData };
}

