import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha2";
import {
  Connection,
  Ed25519Program,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { buildTinUpgradeMessage } from "./canonical-message.js";

export const DEFAULT_TIP_PROGRAM_ID = "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT";
export const TINS_PROGRAM_SALT = "TINS_SALT_2026";

const TINS_GLOBAL_STATE_SEED = Buffer.from("global-state");
const TINS_IDENTITY_SEED = Buffer.from("identity");
const TINS_REGISTRY_SEED = Buffer.from("registry");
const TINS_PLATFORM_REGISTRY_SEED = Buffer.from("platform-registry");
const TINS_MUTATION_STAGE_SEED = Buffer.from("tin-mutation-stage");
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const ZERO_HASH_32 = Buffer.alloc(32);

export type TinSocialIdentityType = "whatsapp" | "x" | "email" | "telegram" | "discord" | string;

export type TinEncryptedSocialIdentity = {
  identityType: TinSocialIdentityType;
  label: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  metadata: string;
  verifiedBy: PublicKey | null;
  proofHash: Uint8Array;
  linkedAt: bigint;
};

export type TinEncryptedSensitiveField = {
  fieldType: "kyc_document_hash" | string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  metadata: string;
  proofHash: Uint8Array;
  linkedAt: bigint;
};

export type TinIdentityRegistry = {
  version: number;
  bump: number;
  status: number;
  tin: bigint;
  authority: PublicKey;
  masterPrivacy: PublicKey;
  lastEscrowId: bigint;
  createdAt: bigint;
  name: string;
  socialIdentities: TinEncryptedSocialIdentity[];
  sensitiveFields: TinEncryptedSensitiveField[];
};

export type TinResolvedIdentity = {
  tin: string;
  name: string;
  authority: PublicKey;
  ownerPubkeyHash: string;
  registry: PublicKey;
  accountKind: "registry" | "legacy";
  upgradeRequired: boolean;
  upgradeReason: string | null;
  settlementAuthorityVerified: boolean;
  status: number;
  createdAt: string;
  socialIdentities: Array<{
    type: TinSocialIdentityType;
    label: string;
    value: string;
    metadata: unknown;
    verifiedBy: string | null;
    linkedAt: string;
  }>;
  sensitiveFields: Array<{
    type: string;
    value: string;
    metadata: unknown;
    linkedAt: string;
  }>;
  encryptedSensitiveFields: TinEncryptedSensitiveField[];
};

function getTinsProgramPublicKey(programId?: PublicKey | string | null) {
  return programId instanceof PublicKey ? programId : new PublicKey(programId ?? DEFAULT_TIP_PROGRAM_ID);
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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
    digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join("")
  );
}

export function getTinsIdentitySeed(walletPubkey: PublicKey): Buffer {
  return Buffer.from(sha256(Buffer.concat([walletPubkey.toBuffer(), Buffer.from(TINS_PROGRAM_SALT, "utf8")])));
}

export function getTinsGlobalStatePda(programId?: PublicKey | string | null): PublicKey {
  return PublicKey.findProgramAddressSync([TINS_GLOBAL_STATE_SEED], getTinsProgramPublicKey(programId))[0];
}

export function getTinsIdentityPda(params: {
  walletPubkey: PublicKey;
  programId?: PublicKey | string | null;
}): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TINS_IDENTITY_SEED, getTinsIdentitySeed(params.walletPubkey)],
    getTinsProgramPublicKey(params.programId),
  )[0];
}

export function getTinsRegistryPda(params: {
  tin: bigint | number | string;
  programId?: PublicKey | string | null;
}): PublicKey {
  const tinBuffer = Buffer.alloc(8);
  tinBuffer.writeBigUInt64LE(BigInt(params.tin));
  return PublicKey.findProgramAddressSync([TINS_REGISTRY_SEED, tinBuffer], getTinsProgramPublicKey(params.programId))[0];
}

export function getTinsPlatformRegistryPda(programId?: PublicKey | string | null): PublicKey {
  return PublicKey.findProgramAddressSync([TINS_PLATFORM_REGISTRY_SEED], getTinsProgramPublicKey(programId))[0];
}

export function getTinsMutationStagingPda(params: {
  ownerPubkey: PublicKey;
  intentHash: Buffer | Uint8Array;
  programId?: PublicKey | string | null;
}) {
  return PublicKey.findProgramAddressSync(
    [TINS_MUTATION_STAGE_SEED, params.ownerPubkey.toBuffer(), requireHash32(params.intentHash, "intentHash")],
    getTinsProgramPublicKey(params.programId),
  )[0];
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

function appendString(parts: Buffer[], value: string) {
  const buffer = Buffer.from(value, "utf8");
  appendU32(parts, buffer.length);
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

function appendOptionPubkey(parts: Buffer[], value: PublicKey | null | undefined) {
  appendU8(parts, value ? 1 : 0);
  if (value) appendPubkey(parts, value);
}

function encodeInstruction(tag: number, parts: Buffer[]) {
  return Buffer.concat([Buffer.from([tag]), ...parts]);
}

function normalizeHash32(value: Buffer | Uint8Array | undefined, label: string): Buffer {
  if (!value) return ZERO_HASH_32;
  const buffer = Buffer.from(value);
  if (buffer.length !== 32) throw new Error(`${label} must be exactly 32 bytes`);
  return buffer;
}

function requireHash32(value: Buffer | Uint8Array | undefined, label: string): Buffer {
  if (!value) throw new Error(`${label} is required`);
  return normalizeHash32(value, label);
}

function bytesToHex(value: Buffer | Uint8Array) {
  return Buffer.from(value).toString("hex");
}

function resolveEncryptedMasterSeed(params: {
  encryptedMasterSeed?: Buffer | Uint8Array;
}) {
  const value = params.encryptedMasterSeed;
  if (!value) {
    throw new Error("encryptedMasterSeed is required for TIP registry mutation serialization");
  }
  return Buffer.from(value);
}

export function createTinOwnerIntentMessage(params: {
  purpose: "create" | "update";
  ownerPubkey: PublicKey;
  tin: bigint | number | string;
  displayName: string;
  phoneNumber: string;
  nonce: Buffer | Uint8Array;
  expiryTs: bigint | number;
}) {
  if (params.purpose !== "update") {
    throw new Error("TIN creation owner intent must use the TSN mempool TIN creation builder");
  }
  return buildTinUpgradeMessage({
    tin: String(params.tin),
    displayName: params.displayName,
    nonce: bytesToHex(requireHash32(params.nonce, "nonce")),
    expires: new Date(Number(params.expiryTs) * 1000).toISOString(),
  });
}

export function createTinOwnerIntentHash(params: {
  purpose: "create" | "update";
  ownerPubkey: PublicKey;
  tin?: bigint | number | string;
  displayName: string;
  phoneNumber?: string;
  encryptedMasterSeed?: Buffer | Uint8Array;
  encryptedMetadataHash?: Buffer | Uint8Array;
  pruConfigurationHash?: Buffer | Uint8Array;
  encryptedPublicRouteEnvelope?: Buffer | Uint8Array;
  routeVersion?: bigint | number;
  routeNonce?: Buffer | Uint8Array;
  nonce: Buffer | Uint8Array;
  expiryTs: bigint | number;
}): Buffer {
  const expiry = Buffer.alloc(8);
  expiry.writeBigInt64LE(BigInt(params.expiryTs));

  const encryptedMasterSeed = params.encryptedMasterSeed;
  if (!encryptedMasterSeed) {
    if (params.tin == null) throw new Error("tin is required for TIP owner intent V2 hashing");
    if (!params.phoneNumber) throw new Error("phoneNumber is required for TIP owner intent V2 hashing");
    return Buffer.from(sha256(TEXT_ENCODER.encode(createTinOwnerIntentMessage({
      purpose: params.purpose,
      ownerPubkey: params.ownerPubkey,
      tin: params.tin,
      displayName: params.displayName,
      phoneNumber: params.phoneNumber,
      nonce: params.nonce,
      expiryTs: params.expiryTs,
    }))));
  }

  return Buffer.from(sha256(Buffer.concat([
    Buffer.from(`TINS_${params.purpose.toUpperCase()}_INTENT_V1`, "utf8"),
    params.ownerPubkey.toBuffer(),
    Buffer.from(params.displayName, "utf8"),
    Buffer.from(encryptedMasterSeed),
    normalizeHash32(params.encryptedMetadataHash, "encryptedMetadataHash"),
    normalizeHash32(params.pruConfigurationHash, "pruConfigurationHash"),
    Buffer.from(params.encryptedPublicRouteEnvelope ?? (() => {
      throw new Error("encryptedPublicRouteEnvelope is required");
    })()),
    (() => {
      const routeVersion = Buffer.alloc(8);
      routeVersion.writeBigUInt64LE(BigInt(params.routeVersion ?? 0));
      if (routeVersion.equals(Buffer.alloc(8))) throw new Error("routeVersion must be positive");
      return routeVersion;
    })(),
    requireHash32(params.routeNonce, "routeNonce"),
    requireHash32(params.nonce, "nonce"),
    expiry,
  ])));
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
 * messages that look like a transaction payload.  The owner commitment is
 * still the exact 32-byte `intentHash`; this wrapper only gives the wallet a
 * stable UTF-8 representation to display and sign.  Verifiers bind the
 * signature to the same hash before accepting the operation.
 */
export function buildTinOwnerIntentMessage(
  intentHash: Buffer | Uint8Array,
): Buffer {
  const normalized = normalizeHash32(intentHash, "intentHash");
  return Buffer.from(
    [
      "TSN TIN Upgrade",
      "---",
      `Intent Hash: ${normalized.toString("hex")}`,
      "Domain: TSN_TIN_OWNER_INTENT_V1",
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
    message: params.message ? Buffer.from(params.message) : normalizeHash32(params.intentHash, "intentHash"),
    signature: Buffer.from(params.signature),
  });
}

export function serializeTinCreationRegistryParams(params: {
  ownerPubkey: PublicKey;
  displayName: string;
  encryptedMasterSeed?: Buffer | Uint8Array;
  encryptedMetadataHash?: Buffer | Uint8Array;
  pruConfigurationHash?: Buffer | Uint8Array;
  encryptedPublicRouteEnvelope?: Buffer | Uint8Array;
  routeVersion?: bigint | number;
  routeNonce?: Buffer | Uint8Array;
  nonce?: Buffer | Uint8Array;
  intentHash: Buffer | Uint8Array;
  expiryTs: bigint | number;
}) {
  return serializeTinRegistryMutationParams(12, params);
}

export function serializeTinUpdateParams(params: {
  ownerPubkey: PublicKey;
  displayName: string;
  encryptedMasterSeed?: Buffer | Uint8Array;
  encryptedMetadataHash?: Buffer | Uint8Array;
  pruConfigurationHash?: Buffer | Uint8Array;
  encryptedPublicRouteEnvelope?: Buffer | Uint8Array;
  routeVersion?: bigint | number;
  routeNonce?: Buffer | Uint8Array;
  nonce?: Buffer | Uint8Array;
  intentHash: Buffer | Uint8Array;
  expiryTs: bigint | number;
}) {
  return serializeTinRegistryMutationParams(13, params);
}

/** Stage large encrypted TIN mutation blobs before the final owner-authorized commit. */
export function serializeTinMutationStageParams(params: {
  ownerPubkey: PublicKey;
  intentHash: Buffer | Uint8Array;
  displayName: string;
  encryptedMetadataHash: Buffer | Uint8Array;
  pruConfigurationHash: Buffer | Uint8Array;
  routeVersion: bigint | number;
  routeNonce: Buffer | Uint8Array;
  nonce: Buffer | Uint8Array;
  expiryTs: bigint | number;
  encryptedMasterSeedLength: number;
  encryptedPublicRouteEnvelopeLength: number;
}) {
  if (!Number.isSafeInteger(params.encryptedMasterSeedLength) || params.encryptedMasterSeedLength <= 0) {
    throw new Error("encryptedMasterSeedLength must be a positive safe integer");
  }
  if (!Number.isSafeInteger(params.encryptedPublicRouteEnvelopeLength) || params.encryptedPublicRouteEnvelopeLength <= 0) {
    throw new Error("encryptedPublicRouteEnvelopeLength must be a positive safe integer");
  }
  const parts: Buffer[] = [];
  appendPubkey(parts, params.ownerPubkey);
  parts.push(requireHash32(params.intentHash, "intentHash"));
  appendString(parts, params.displayName);
  parts.push(requireHash32(params.encryptedMetadataHash, "encryptedMetadataHash"));
  parts.push(requireHash32(params.pruConfigurationHash, "pruConfigurationHash"));
  appendU64(parts, params.routeVersion);
  parts.push(requireHash32(params.routeNonce, "routeNonce"));
  parts.push(requireHash32(params.nonce, "nonce"));
  appendI64(parts, params.expiryTs);
  appendU32(parts, params.encryptedMasterSeedLength);
  appendU32(parts, params.encryptedPublicRouteEnvelopeLength);
  return encodeInstruction(14, parts);
}

export function serializeTinMutationChunkParams(params: {
  kind: "master_seed" | "public_route";
  offset: number;
  bytes: Buffer | Uint8Array;
}) {
  if (!Number.isSafeInteger(params.offset) || params.offset < 0) {
    throw new Error("mutation chunk offset must be a non-negative safe integer");
  }
  const parts: Buffer[] = [];
  appendU8(parts, params.kind === "master_seed" ? 0 : 1);
  appendU32(parts, params.offset);
  appendBytes(parts, params.bytes);
  return encodeInstruction(15, parts);
}

export function serializeTinUpdateStagedParams(params: {
  intentHash: Buffer | Uint8Array;
}) {
  return encodeInstruction(16, [requireHash32(params.intentHash, "intentHash")]);
}

function serializeTinRegistryMutationParams(
  tag: 12 | 13,
  params: {
    ownerPubkey: PublicKey;
    displayName: string;
    encryptedMasterSeed?: Buffer | Uint8Array;
    encryptedMetadataHash?: Buffer | Uint8Array;
    pruConfigurationHash?: Buffer | Uint8Array;
    encryptedPublicRouteEnvelope?: Buffer | Uint8Array;
    routeVersion?: bigint | number;
    routeNonce?: Buffer | Uint8Array;
    nonce?: Buffer | Uint8Array;
    intentHash: Buffer | Uint8Array;
    expiryTs: bigint | number;
  },
) {
  const parts: Buffer[] = [];
  const encryptedMasterSeed = resolveEncryptedMasterSeed(params);
  appendPubkey(parts, params.ownerPubkey);
  appendString(parts, params.displayName);
  appendBytes(parts, encryptedMasterSeed);
  parts.push(normalizeHash32(params.encryptedMetadataHash, "encryptedMetadataHash"));
  parts.push(normalizeHash32(params.pruConfigurationHash, "pruConfigurationHash"));
  appendBytes(parts, params.encryptedPublicRouteEnvelope ?? (() => {
    throw new Error("encryptedPublicRouteEnvelope is required");
  })());
  const routeVersion = Buffer.alloc(8);
  routeVersion.writeBigUInt64LE(BigInt(params.routeVersion ?? 0));
  if (routeVersion.equals(Buffer.alloc(8))) throw new Error("routeVersion must be positive");
  parts.push(routeVersion);
  parts.push(requireHash32(params.routeNonce, "routeNonce"));
  parts.push(requireHash32(params.nonce, "nonce"));
  parts.push(normalizeHash32(params.intentHash, "intentHash"));
  const expiry = Buffer.alloc(8);
  expiry.writeBigInt64LE(BigInt(params.expiryTs));
  parts.push(expiry);
  return encodeInstruction(tag, parts);
}

export function buildCreateTinInstruction(params: {
  payer: PublicKey;
  identity: PublicKey;
  displayName: string;
  encryptedMasterSeed: Uint8Array;
  programId?: PublicKey | string | null;
}) {
  void params;
  throw new Error("Direct TIP create is disabled; submit a TSN TIN creation intent and let a Cranker call tin_creation_registry.");
}

export function buildInitializePlatformRegistryInstruction(params: {
  authority: PublicKey;
  platformRegistry?: PublicKey;
  programId?: PublicKey | string | null;
}) {
  const program = getTinsProgramPublicKey(params.programId);
  return new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.platformRegistry ?? getTinsPlatformRegistryPda(program), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeInstruction(6, []),
  });
}

export function buildUpsertVerificationPlatformInstruction(params: {
  authority: PublicKey;
  platformId: string;
  platformPubkey: PublicKey;
  rotatedFrom?: PublicKey | null;
  platformRegistry?: PublicKey;
  programId?: PublicKey | string | null;
}) {
  const parts: Buffer[] = [];
  appendString(parts, params.platformId);
  appendPubkey(parts, params.platformPubkey);
  appendOptionPubkey(parts, params.rotatedFrom ?? null);
  const program = getTinsProgramPublicKey(params.programId);
  return new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.platformRegistry ?? getTinsPlatformRegistryPda(program), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeInstruction(7, parts),
  });
}

export function buildRemoveVerificationPlatformInstruction(params: {
  authority: PublicKey;
  platformPubkey: PublicKey;
  platformRegistry?: PublicKey;
  programId?: PublicKey | string | null;
}) {
  const parts: Buffer[] = [];
  appendPubkey(parts, params.platformPubkey);
  const program = getTinsProgramPublicKey(params.programId);
  return new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.platformRegistry ?? getTinsPlatformRegistryPda(program), isSigner: false, isWritable: true },
    ],
    data: encodeInstruction(8, parts),
  });
}

export function buildLinkSocialIdentityInstruction(params: {
  owner: PublicKey;
  registry: PublicKey;
  identityType: TinSocialIdentityType;
  label?: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  metadata?: string;
  programId?: PublicKey | string | null;
}) {
  const parts: Buffer[] = [];
  appendString(parts, params.identityType);
  appendString(parts, params.label ?? "");
  appendBytes(parts, params.nonce);
  appendBytes(parts, params.ciphertext);
  appendString(parts, params.metadata ?? "{}");
  return new TransactionInstruction({
    programId: getTinsProgramPublicKey(params.programId),
    keys: [
      { pubkey: params.owner, isSigner: true, isWritable: true },
      { pubkey: params.registry, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeInstruction(9, parts),
  });
}

export function buildLinkSensitiveFieldInstruction(params: {
  owner: PublicKey;
  registry: PublicKey;
  fieldType: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  metadata?: string;
  userAuthorizationHash: Uint8Array;
  programId?: PublicKey | string | null;
}) {
  if (params.userAuthorizationHash.length !== 32) throw new Error("userAuthorizationHash must be 32 bytes");
  const parts: Buffer[] = [];
  appendString(parts, params.fieldType);
  appendBytes(parts, params.nonce);
  appendBytes(parts, params.ciphertext);
  appendString(parts, params.metadata ?? "{}");
  parts.push(Buffer.from(params.userAuthorizationHash));
  return new TransactionInstruction({
    programId: getTinsProgramPublicKey(params.programId),
    keys: [
      { pubkey: params.owner, isSigner: true, isWritable: true },
      { pubkey: params.registry, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeInstruction(10, parts),
  });
}

export function buildPlatformSignedProofMessage(params: {
  tin: bigint | number | string;
  identityType: string;
  label?: string;
  encryptedPayloadHash: Uint8Array;
  subjectWallet: PublicKey;
  issuedAt: bigint | number;
}) {
  if (params.encryptedPayloadHash.length !== 32) throw new Error("encryptedPayloadHash must be 32 bytes");
  return Buffer.concat([
    Buffer.from("TINS_PLATFORM_PROOF_V1", "utf8"),
    Buffer.from(String(params.tin), "utf8"),
    Buffer.from(params.identityType, "utf8"),
    Buffer.from(params.label ?? "", "utf8"),
    Buffer.from(params.encryptedPayloadHash),
    params.subjectWallet.toBuffer(),
    Buffer.from(BigInt(params.issuedAt).toString(), "utf8"),
  ]);
}

export function buildLinkVerifiedSocialIdentityInstructions(params: {
  owner: PublicKey;
  registry: PublicKey;
  platformPubkey: PublicKey;
  platformSignature: Uint8Array;
  proofMessage: Uint8Array;
  identityType: TinSocialIdentityType;
  label?: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  metadata?: string;
  platformRegistry?: PublicKey;
  programId?: PublicKey | string | null;
}) {
  const parts: Buffer[] = [];
  appendString(parts, params.identityType);
  appendString(parts, params.label ?? "");
  appendBytes(parts, params.nonce);
  appendBytes(parts, params.ciphertext);
  appendString(parts, params.metadata ?? "{}");
  appendPubkey(parts, params.platformPubkey);
  appendBytes(parts, params.proofMessage);
  const program = getTinsProgramPublicKey(params.programId);
  return [
    Ed25519Program.createInstructionWithPublicKey({
      publicKey: params.platformPubkey.toBytes(),
      message: params.proofMessage,
      signature: params.platformSignature,
    }),
    new TransactionInstruction({
      programId: program,
      keys: [
        { pubkey: params.owner, isSigner: true, isWritable: true },
        { pubkey: params.registry, isSigner: false, isWritable: true },
        { pubkey: params.platformRegistry ?? getTinsPlatformRegistryPda(program), isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(11, parts),
    }),
  ];
}

export function decodeTinAccount(data: Uint8Array) {
  const buffer = Buffer.from(data);
  let offset = 0;
  const tin = buffer.readBigUInt64LE(offset);
  offset += 8;
  const displayNameLength = buffer.readUInt32LE(offset);
  offset += 4;
  const displayName = buffer.subarray(offset, offset + displayNameLength).toString("utf8");
  offset += displayNameLength;
  const ownerPubkeyHash = buffer.subarray(offset, offset + 32);
  offset += 32;
  const encryptedMasterSeedLength = buffer.readUInt32LE(offset);
  offset += 4;
  const encryptedMasterSeed = buffer.subarray(offset, offset + encryptedMasterSeedLength);
  offset += encryptedMasterSeedLength;
  const createdAt = buffer.readBigInt64LE(offset);
  offset += 8;
  const encryptedMetadataHash = offset + 32 <= buffer.length
    ? buffer.subarray(offset, offset + 32)
    : null;
  offset += encryptedMetadataHash ? 32 : 0;
  const pruConfigurationHash = offset + 32 <= buffer.length
    ? buffer.subarray(offset, offset + 32)
    : null;
  offset += pruConfigurationHash ? 32 : 0;
  let encryptedPublicRouteEnvelope: Buffer | null = null;
  let routeVersion: bigint | null = null;
  let routeNonce: Buffer | null = null;
  if (offset + 4 <= buffer.length) {
    const routeEnvelopeLength = buffer.readUInt32LE(offset);
    offset += 4;
    if (routeEnvelopeLength > 0 && offset + routeEnvelopeLength + 8 + 32 <= buffer.length) {
      encryptedPublicRouteEnvelope = buffer.subarray(offset, offset + routeEnvelopeLength);
      offset += routeEnvelopeLength;
      routeVersion = buffer.readBigUInt64LE(offset);
      offset += 8;
      routeNonce = buffer.subarray(offset, offset + 32);
    }
  }

  return {
    tin,
    displayName,
    ownerPubkeyHash,
    encryptedMasterSeed,
    createdAt,
    encryptedMetadataHash,
    pruConfigurationHash,
    encryptedPublicRouteEnvelope,
    routeVersion,
    routeNonce,
  };
}

async function findLegacyTinAccount(params: {
  tin: bigint | number | string;
  connection: Connection;
  programId: PublicKey;
}) {
  const tinBuffer = Buffer.alloc(8);
  tinBuffer.writeBigUInt64LE(BigInt(params.tin));
  const accounts = await params.connection.getProgramAccounts(params.programId, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: encodeBase58(tinBuffer),
        },
      },
    ],
  });

  for (const account of accounts) {
    try {
      const decoded = decodeTinAccount(account.account.data);
      if (decoded.tin.toString() === String(params.tin)) {
        return { address: account.pubkey, decoded };
      }
    } catch {
      // Other TIP account layouts can share the same leading bytes.
    }
  }
  return null;
}

async function findLegacyTinCreationAuthority(
  connection: Connection,
  identityAccount: PublicKey,
) {
  let before: string | undefined;
  let oldestSignature: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const signatures = await connection.getSignaturesForAddress(
      identityAccount,
      { before, limit: 1_000 },
      "confirmed",
    );
    if (signatures.length === 0) break;
    oldestSignature = signatures[signatures.length - 1].signature;
    if (signatures.length < 1_000) break;
    before = oldestSignature;
  }
  if (!oldestSignature) return null;

  const transaction = await connection.getParsedTransaction(oldestSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const signer = transaction?.transaction.message.accountKeys.find(
    (account) => account.signer && !account.pubkey.equals(identityAccount),
  );
  return signer?.pubkey ?? null;
}

function readString(buffer: Buffer, offsetRef: { offset: number }) {
  const length = buffer.readUInt32LE(offsetRef.offset);
  offsetRef.offset += 4;
  const value = buffer.subarray(offsetRef.offset, offsetRef.offset + length).toString("utf8");
  offsetRef.offset += length;
  return value;
}

function readBytes(buffer: Buffer, offsetRef: { offset: number }) {
  const length = buffer.readUInt32LE(offsetRef.offset);
  offsetRef.offset += 4;
  const value = buffer.subarray(offsetRef.offset, offsetRef.offset + length);
  offsetRef.offset += length;
  return value;
}

function readPubkey(buffer: Buffer, offsetRef: { offset: number }) {
  const value = new PublicKey(buffer.subarray(offsetRef.offset, offsetRef.offset + 32));
  offsetRef.offset += 32;
  return value;
}

function readOptionPubkey(buffer: Buffer, offsetRef: { offset: number }) {
  const tag = buffer.readUInt8(offsetRef.offset);
  offsetRef.offset += 1;
  return tag === 1 ? readPubkey(buffer, offsetRef) : null;
}

export function decodeTinsIdentityRegistry(data: Uint8Array): TinIdentityRegistry {
  const buffer = Buffer.from(data);
  const offsetRef = { offset: 0 };
  const version = buffer.readUInt8(offsetRef.offset++);
  const bump = buffer.readUInt8(offsetRef.offset++);
  const status = buffer.readUInt8(offsetRef.offset++);
  offsetRef.offset += 5;
  const tin = buffer.readBigUInt64LE(offsetRef.offset);
  offsetRef.offset += 8;
  const authority = readPubkey(buffer, offsetRef);
  const masterPrivacy = readPubkey(buffer, offsetRef);
  const lastEscrowId = buffer.readBigUInt64LE(offsetRef.offset);
  offsetRef.offset += 8;
  const createdAt = buffer.readBigInt64LE(offsetRef.offset);
  offsetRef.offset += 8;
  const name = readString(buffer, offsetRef);
  if (offsetRef.offset === buffer.length) {
    return {
      version,
      bump,
      status,
      tin,
      authority,
      masterPrivacy,
      lastEscrowId,
      createdAt,
      name,
      socialIdentities: [],
      sensitiveFields: [],
    };
  }
  if (offsetRef.offset + 4 > buffer.length) {
    throw new Error("TIP identity registry data is truncated");
  }
  const socialCount = buffer.readUInt32LE(offsetRef.offset);
  offsetRef.offset += 4;
  const socialIdentities: TinEncryptedSocialIdentity[] = [];
  for (let index = 0; index < socialCount; index += 1) {
    socialIdentities.push({
      identityType: readString(buffer, offsetRef),
      label: readString(buffer, offsetRef),
      nonce: readBytes(buffer, offsetRef),
      ciphertext: readBytes(buffer, offsetRef),
      metadata: readString(buffer, offsetRef),
      verifiedBy: readOptionPubkey(buffer, offsetRef),
      proofHash: buffer.subarray(offsetRef.offset, offsetRef.offset + 32),
      linkedAt: buffer.readBigInt64LE(offsetRef.offset + 32),
    });
    offsetRef.offset += 40;
  }
  const sensitiveCount = buffer.readUInt32LE(offsetRef.offset);
  offsetRef.offset += 4;
  const sensitiveFields: TinEncryptedSensitiveField[] = [];
  for (let index = 0; index < sensitiveCount; index += 1) {
    sensitiveFields.push({
      fieldType: readString(buffer, offsetRef),
      nonce: readBytes(buffer, offsetRef),
      ciphertext: readBytes(buffer, offsetRef),
      metadata: readString(buffer, offsetRef),
      proofHash: buffer.subarray(offsetRef.offset, offsetRef.offset + 32),
      linkedAt: buffer.readBigInt64LE(offsetRef.offset + 32),
    });
    offsetRef.offset += 40;
  }

  return {
    version,
    bump,
    status,
    tin,
    authority,
    masterPrivacy,
    lastEscrowId,
    createdAt,
    name,
    socialIdentities,
    sensitiveFields,
  };
}

function parseMetadata(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getWebCrypto() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error("WebCrypto subtle API is required for TIN encryption");
  return cryptoApi;
}

function randomNonce(length = 12) {
  const nonce = new Uint8Array(length);
  getWebCrypto().getRandomValues(nonce);
  return nonce;
}

async function importAesKey(keyMaterial: Uint8Array) {
  return getWebCrypto().subtle.importKey("raw", keyMaterial as any, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function deriveTinSocialKey(tin: bigint | number | string) {
  return sha256(TEXT_ENCODER.encode(`trustlink:tins:social:v1:${String(tin)}`));
}

export function buildSensitiveAuthorizationMessage(params: {
  tin: bigint | number | string;
  fieldType: string;
  nonce?: string;
}) {
  return `TrustLink TIP sensitive decrypt\nTIN: ${String(params.tin)}\nField: ${params.fieldType}\nNonce: ${params.nonce ?? ""}`;
}

export function deriveTinSensitiveKey(params: {
  tin: bigint | number | string;
  userSignature: Uint8Array | string;
  fieldType: string;
}) {
  const signature =
    typeof params.userSignature === "string"
      ? TEXT_ENCODER.encode(params.userSignature)
      : params.userSignature;
  return sha256(
    Buffer.concat([
      TEXT_ENCODER.encode(`trustlink:tins:sensitive:v1:${String(params.tin)}:${params.fieldType}:`),
      Buffer.from(signature),
    ]),
  );
}

export async function encryptTinSocialIdentity(params: {
  tin: bigint | number | string;
  value: string;
  nonce?: Uint8Array;
}) {
  const nonce = params.nonce ?? randomNonce();
  const key = await importAesKey(deriveTinSocialKey(params.tin));
  const ciphertext = new Uint8Array(
    await getWebCrypto().subtle.encrypt({ name: "AES-GCM", iv: nonce as any }, key, TEXT_ENCODER.encode(params.value) as any),
  );
  return { nonce, ciphertext };
}

export async function decryptTinSocialIdentity(params: {
  tin: bigint | number | string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}) {
  const key = await importAesKey(deriveTinSocialKey(params.tin));
  const plaintext = await getWebCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: params.nonce as any },
    key,
    params.ciphertext as any,
  );
  return TEXT_DECODER.decode(plaintext);
}

export async function encryptTinSensitiveField(params: {
  tin: bigint | number | string;
  fieldType: string;
  value: string;
  userSignature: Uint8Array | string;
  nonce?: Uint8Array;
}) {
  const nonce = params.nonce ?? randomNonce();
  const key = await importAesKey(deriveTinSensitiveKey(params));
  const ciphertext = new Uint8Array(
    await getWebCrypto().subtle.encrypt({ name: "AES-GCM", iv: nonce as any }, key, TEXT_ENCODER.encode(params.value) as any),
  );
  const signatureBytes =
    typeof params.userSignature === "string"
      ? TEXT_ENCODER.encode(params.userSignature)
      : params.userSignature;
  return { nonce, ciphertext, userAuthorizationHash: sha256(signatureBytes) };
}

export async function decryptTinSensitiveField(params: {
  tin: bigint | number | string;
  fieldType: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  userSignature: Uint8Array | string;
}) {
  const key = await importAesKey(deriveTinSensitiveKey(params));
  const plaintext = await getWebCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: params.nonce as any },
    key,
    params.ciphertext as any,
  );
  return TEXT_DECODER.decode(plaintext);
}

export async function resolveTIN(params: {
  tin: bigint | number | string;
  connection: Connection;
  programId?: PublicKey | string | null;
  sensitiveAuthorizations?: Record<string, Uint8Array | string>;
}): Promise<TinResolvedIdentity> {
  const programId = getTinsProgramPublicKey(params.programId);
  const registryPda = getTinsRegistryPda({ tin: params.tin, programId });
  const account = await params.connection.getAccountInfo(registryPda);
  if (!account) {
    const legacy = await findLegacyTinAccount({
      tin: params.tin,
      connection: params.connection,
      programId,
    });
    if (!legacy) {
      throw new Error(
        `TIN ${String(params.tin)} was not found in TIP program ${programId.toBase58()}`,
      );
    }
    const hasCurrentTsnEnvelopes =
      legacy.decoded.encryptedMasterSeed.length > 0 &&
      Boolean(legacy.decoded.pruConfigurationHash?.length === 32) &&
      Boolean(legacy.decoded.encryptedPublicRouteEnvelope?.length) &&
      Boolean(legacy.decoded.routeVersion && legacy.decoded.routeVersion > 0n) &&
      Boolean(legacy.decoded.routeNonce?.length === 32);
    return {
      tin: legacy.decoded.tin.toString(),
      name: legacy.decoded.displayName,
      authority: legacy.address,
      ownerPubkeyHash: bytesToHex(legacy.decoded.ownerPubkeyHash),
      registry: legacy.address,
      accountKind: "legacy",
      // Some Devnet TIN accounts retain the original TIP storage layout while
      // already carrying the complete TSN envelopes. Storage layout is not a
      // capability decision: only missing TSN envelope fields require an
      // upgrade and should block local balance discovery.
      upgradeRequired: !hasCurrentTsnEnvelopes,
      upgradeReason: hasCurrentTsnEnvelopes
        ? null
        : "Legacy TIN requires a wallet-authorized, device-protected seed envelope before local PRU balance discovery is available.",
      settlementAuthorityVerified: true,
      status: 1,
      createdAt: legacy.decoded.createdAt.toString(),
      socialIdentities: [],
      sensitiveFields: [],
      encryptedSensitiveFields: [],
    };
  }
  try {
    const tinAccount = decodeTinAccount(account.data);
    if (tinAccount.tin.toString() === String(params.tin)) {
      return {
        tin: tinAccount.tin.toString(),
        name: tinAccount.displayName,
        authority: registryPda,
        ownerPubkeyHash: bytesToHex(tinAccount.ownerPubkeyHash),
        registry: registryPda,
        accountKind: "registry",
        upgradeRequired:
          !tinAccount.pruConfigurationHash ||
          !tinAccount.encryptedPublicRouteEnvelope ||
          !tinAccount.routeVersion ||
          !tinAccount.routeNonce,
        upgradeReason:
          tinAccount.pruConfigurationHash &&
          tinAccount.encryptedPublicRouteEnvelope &&
          tinAccount.routeVersion &&
          tinAccount.routeNonce
          ? null
          : "TIN account does not yet store the wallet-bound seed envelope and Node routing envelope.",
        settlementAuthorityVerified: true,
        status: 1,
        createdAt: tinAccount.createdAt.toString(),
        socialIdentities: [],
        sensitiveFields: [],
        encryptedSensitiveFields: [],
      };
    }
  } catch {
  }
  const registry = decodeTinsIdentityRegistry(account.data);
  const socialIdentities = await Promise.all(
    registry.socialIdentities.map(async (identity) => ({
      type: identity.identityType,
      label: identity.label,
      value: await decryptTinSocialIdentity({
        tin: params.tin,
        nonce: identity.nonce,
        ciphertext: identity.ciphertext,
      }),
      metadata: parseMetadata(identity.metadata),
      verifiedBy: identity.verifiedBy?.toBase58() ?? null,
      linkedAt: identity.linkedAt.toString(),
    })),
  );
  const sensitiveFields = [];
  for (const field of registry.sensitiveFields) {
    const signature = params.sensitiveAuthorizations?.[field.fieldType];
    if (!signature) continue;
    sensitiveFields.push({
      type: field.fieldType,
      value: await decryptTinSensitiveField({
        tin: params.tin,
        fieldType: field.fieldType,
        nonce: field.nonce,
        ciphertext: field.ciphertext,
        userSignature: signature,
      }),
      metadata: parseMetadata(field.metadata),
      linkedAt: field.linkedAt.toString(),
    });
  }

  return {
    tin: String(params.tin),
    name: registry.name,
    authority: registryPda,
    ownerPubkeyHash: bytesToHex(sha256(registry.authority.toBytes())),
    registry: registryPda,
    accountKind: "registry",
    upgradeRequired: false,
    upgradeReason: null,
    settlementAuthorityVerified: true,
    status: registry.status,
    createdAt: registry.createdAt.toString(),
    socialIdentities,
    sensitiveFields,
    encryptedSensitiveFields: registry.sensitiveFields,
  };
}
