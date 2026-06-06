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

export const DEFAULT_TINS_PROGRAM_ID = "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT";
export const TINS_PROGRAM_SALT = "TINS_SALT_2026";

const TINS_GLOBAL_STATE_SEED = Buffer.from("global-state");
const TINS_IDENTITY_SEED = Buffer.from("identity");
const TINS_REGISTRY_SEED = Buffer.from("registry");
const TINS_PLATFORM_REGISTRY_SEED = Buffer.from("platform-registry");
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

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
  return programId instanceof PublicKey ? programId : new PublicKey(programId ?? DEFAULT_TINS_PROGRAM_ID);
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

export function buildCreateTinInstruction(params: {
  payer: PublicKey;
  identity: PublicKey;
  displayName: string;
  encryptedPhone: Uint8Array;
  programId?: PublicKey | string | null;
}) {
  const name = Buffer.from(params.displayName, "utf8");
  const encryptedPhone = Buffer.from(params.encryptedPhone);
  const data = Buffer.alloc(1 + 4 + name.length + 4 + encryptedPhone.length);
  let offset = 0;
  data.writeUInt8(4, offset);
  offset += 1;
  data.writeUInt32LE(name.length, offset);
  offset += 4;
  name.copy(data, offset);
  offset += name.length;
  data.writeUInt32LE(encryptedPhone.length, offset);
  offset += 4;
  encryptedPhone.copy(data, offset);

  const program = getTinsProgramPublicKey(params.programId);
  return new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: getTinsGlobalStatePda(program), isSigner: false, isWritable: true },
      { pubkey: params.identity, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
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
  const identityPubkey = new PublicKey(buffer.subarray(offset, offset + 32));
  offset += 32;
  const encryptedPhoneLength = buffer.readUInt32LE(offset);
  offset += 4;
  const encryptedPhone = buffer.subarray(offset, offset + encryptedPhoneLength);
  offset += encryptedPhoneLength;
  const createdAt = buffer.readBigInt64LE(offset);

  return {
    tin,
    displayName,
    identityPubkey,
    encryptedPhone,
    createdAt,
  };
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
  return getWebCrypto().subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function deriveTinSocialKey(tin: bigint | number | string) {
  return sha256(TEXT_ENCODER.encode(`trustlink:tins:social:v1:${String(tin)}`));
}

export function buildSensitiveAuthorizationMessage(params: {
  tin: bigint | number | string;
  fieldType: string;
  nonce?: string;
}) {
  return `TrustLink TINS sensitive decrypt\nTIN: ${String(params.tin)}\nField: ${params.fieldType}\nNonce: ${params.nonce ?? ""}`;
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
    await getWebCrypto().subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, TEXT_ENCODER.encode(params.value)),
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
    { name: "AES-GCM", iv: params.nonce },
    key,
    params.ciphertext,
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
    await getWebCrypto().subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, TEXT_ENCODER.encode(params.value)),
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
    { name: "AES-GCM", iv: params.nonce },
    key,
    params.ciphertext,
  );
  return TEXT_DECODER.decode(plaintext);
}

export async function resolveTIN(params: {
  tin: bigint | number | string;
  connection: Connection;
  programId?: PublicKey | string | null;
  sensitiveAuthorizations?: Record<string, Uint8Array | string>;
}): Promise<TinResolvedIdentity> {
  const registryPda = getTinsRegistryPda({ tin: params.tin, programId: params.programId });
  const account = await params.connection.getAccountInfo(registryPda);
  if (!account) throw new Error(`TIN ${String(params.tin)} registry account was not found`);
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
    authority: registry.authority,
    socialIdentities,
    sensitiveFields,
    encryptedSensitiveFields: registry.sensitiveFields,
  };
}
