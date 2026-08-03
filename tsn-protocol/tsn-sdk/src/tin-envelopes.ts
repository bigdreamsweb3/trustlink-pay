import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";

import { canonicalFields, sha256Hex } from "./receipts/internal/encoding.js";
import type { PruEndpoint } from "./pru.js";

export const TIN_MASTER_SEED_ENVELOPE_VERSION = "tsn-tin-master-seed-envelope" as const;
export const TIN_MASTER_SEED_LOCAL_ENCRYPTION_ALGORITHM =
  "aes-256-gcm-local-master-seed" as const;
export const TIN_MASTER_SEED_ACCESS_DOMAIN = "TSN_TIN_MASTER_SEED_ACCESS" as const;
export const TIN_PUBLIC_ROUTE_ENVELOPE_VERSION = "tsn-tin-public-route-envelope" as const;
export const TIN_PUBLIC_ROUTE_ENCRYPTION_ALGORITHM = "x25519-xsalsa20-poly1305" as const;

/**
 * The locally encrypted master seed plus an opaque threshold-protected data
 * key. The SDK never serializes a device private key, wallet signature, master
 * seed, or backend capability into this envelope.
 */
export type TinMasterSeedEnvelope = {
  version: typeof TIN_MASTER_SEED_ENVELOPE_VERSION;
  provider: string;
  tin: string;
  ownerPublicKey: string;
  routeVersion: number;
  pruConfigurationHash: string;
  resourceCommitment: string;
  seedEncryptionAlgorithm: typeof TIN_MASTER_SEED_LOCAL_ENCRYPTION_ALGORITHM;
  seedCiphertext: string;
  seedNonce: string;
  seedCiphertextCommitment: string;
  protectedKey: string;
  protectedKeyCommitment: string;
  accessControlHash: string;
  integrityCommitment: string;
};

export type TinPublicRouteEntry = {
  index: number;
  publicKey: string;
  publicKeyHex: string;
  state: "PLANNED" | "ACTIVE" | "USED" | "SWEPT";
};

export type TinPublicRoutePayload = {
  version: typeof TIN_PUBLIC_ROUTE_ENVELOPE_VERSION;
  tin: string;
  routeVersion: number;
  routeNonce: string;
  pruConfigurationHash: string;
  prus: TinPublicRouteEntry[];
};

export type TinPublicRouteEnvelope = {
  version: typeof TIN_PUBLIC_ROUTE_ENVELOPE_VERSION;
  algorithm: typeof TIN_PUBLIC_ROUTE_ENCRYPTION_ALGORITHM;
  ephemeralPublicKey: string;
  nonce: string;
  ciphertext: string;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(value: Uint8Array) {
  return Buffer.from(value).toString("base64");
}

function base64ToBytes(value: string, label: string) {
  const bytes = Buffer.from(value, "base64");
  if (!value || bytes.length === 0) throw new Error(`${label} is invalid`);
  return new Uint8Array(bytes);
}

function assertHash32(value: string, label: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`${label} must be a 32-byte hexadecimal commitment`);
  }
}

function assertRouteVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("routeVersion must be a positive safe integer");
  }
}

export function encodeTinEnvelope(value: TinMasterSeedEnvelope | TinPublicRouteEnvelope) {
  return textEncoder.encode(JSON.stringify(value));
}

export function decodeTinMasterSeedEnvelope(value: Uint8Array): TinMasterSeedEnvelope {
  const parsed = JSON.parse(textDecoder.decode(value)) as Partial<TinMasterSeedEnvelope>;
  if (parsed.version !== TIN_MASTER_SEED_ENVELOPE_VERSION) {
    throw new Error("TIN master-seed envelope version is unsupported");
  }
  if (
    !parsed.provider ||
    !parsed.tin ||
    !parsed.ownerPublicKey ||
    parsed.seedEncryptionAlgorithm !== TIN_MASTER_SEED_LOCAL_ENCRYPTION_ALGORITHM ||
    !parsed.seedCiphertext ||
    !parsed.seedNonce ||
    !parsed.seedCiphertextCommitment ||
    !parsed.protectedKey ||
    !parsed.protectedKeyCommitment ||
    !parsed.accessControlHash ||
    !parsed.integrityCommitment
  ) {
    throw new Error("TIN master-seed envelope is incomplete");
  }
  assertRouteVersion(Number(parsed.routeVersion));
  assertHash32(String(parsed.pruConfigurationHash), "pruConfigurationHash");
  assertHash32(String(parsed.resourceCommitment), "resourceCommitment");
  assertHash32(String(parsed.seedCiphertextCommitment), "seedCiphertextCommitment");
  assertHash32(String(parsed.protectedKeyCommitment), "protectedKeyCommitment");
  assertHash32(String(parsed.accessControlHash), "accessControlHash");
  assertHash32(String(parsed.integrityCommitment), "integrityCommitment");
  return parsed as TinMasterSeedEnvelope;
}

export function serializeTinMasterSeedWalletAuthorization(params: {
  tin: string;
  ownerPublicKey: string;
  routeVersion: number;
  pruConfigurationHash: string;
  resourceCommitment: string;
  deviceSessionBinding: string;
}) {
  assertRouteVersion(params.routeVersion);
  assertHash32(params.pruConfigurationHash, "pruConfigurationHash");
  assertHash32(params.resourceCommitment, "resourceCommitment");
  return canonicalFields([
    TIN_MASTER_SEED_ACCESS_DOMAIN,
    params.tin,
    params.ownerPublicKey,
    String(params.routeVersion),
    params.pruConfigurationHash.toLowerCase(),
    params.resourceCommitment.toLowerCase(),
    params.deviceSessionBinding,
  ]);
}

export async function createTinMasterSeedEnvelope(params: {
  provider: string;
  tin: string;
  ownerPublicKey: string;
  routeVersion: number;
  pruConfigurationHash: string;
  resourceCommitment: string;
  seedCiphertext: string;
  seedNonce: string;
  seedCiphertextCommitment: string;
  protectedKey: string;
  protectedKeyCommitment: string;
  accessControlHash: string;
}): Promise<TinMasterSeedEnvelope> {
  assertRouteVersion(params.routeVersion);
  assertHash32(params.pruConfigurationHash, "pruConfigurationHash");
  assertHash32(params.resourceCommitment, "resourceCommitment");
  assertHash32(params.seedCiphertextCommitment, "seedCiphertextCommitment");
  assertHash32(params.protectedKeyCommitment, "protectedKeyCommitment");
  assertHash32(params.accessControlHash, "accessControlHash");
  const identity = {
    version: TIN_MASTER_SEED_ENVELOPE_VERSION,
    provider: params.provider,
    tin: params.tin,
    ownerPublicKey: params.ownerPublicKey,
    routeVersion: params.routeVersion,
    pruConfigurationHash: params.pruConfigurationHash.toLowerCase(),
    resourceCommitment: params.resourceCommitment.toLowerCase(),
    seedEncryptionAlgorithm: TIN_MASTER_SEED_LOCAL_ENCRYPTION_ALGORITHM,
    seedCiphertext: params.seedCiphertext,
    seedNonce: params.seedNonce,
    seedCiphertextCommitment: params.seedCiphertextCommitment.toLowerCase(),
    protectedKey: params.protectedKey,
    protectedKeyCommitment: params.protectedKeyCommitment.toLowerCase(),
    accessControlHash: params.accessControlHash.toLowerCase(),
  };
  return {
    ...identity,
    integrityCommitment: await sha256Hex(canonicalFields([
      identity.version,
      identity.provider,
      identity.tin,
      identity.ownerPublicKey,
      String(identity.routeVersion),
      identity.pruConfigurationHash,
      identity.resourceCommitment,
      identity.seedEncryptionAlgorithm,
      identity.seedCiphertext,
      identity.seedNonce,
      identity.seedCiphertextCommitment,
      identity.protectedKey,
      identity.protectedKeyCommitment,
      identity.accessControlHash,
    ])),
  };
}

export async function validateTinMasterSeedEnvelope(params: {
  envelope: TinMasterSeedEnvelope | Uint8Array;
  tin: string;
  ownerPublicKey: string;
  pruConfigurationHash: string;
}) {
  const envelope = params.envelope instanceof Uint8Array
    ? decodeTinMasterSeedEnvelope(params.envelope)
    : params.envelope;
  if (
    envelope.tin !== params.tin ||
    envelope.ownerPublicKey !== params.ownerPublicKey ||
    envelope.pruConfigurationHash.toLowerCase() !== params.pruConfigurationHash.toLowerCase()
  ) {
    throw new Error("TIN master-seed envelope identity does not match");
  }
  const expectedIntegrity = await createTinMasterSeedEnvelope({
    provider: envelope.provider,
    tin: envelope.tin,
    ownerPublicKey: envelope.ownerPublicKey,
    routeVersion: envelope.routeVersion,
    pruConfigurationHash: envelope.pruConfigurationHash,
    resourceCommitment: envelope.resourceCommitment,
    seedCiphertext: envelope.seedCiphertext,
    seedNonce: envelope.seedNonce,
    seedCiphertextCommitment: envelope.seedCiphertextCommitment,
    protectedKey: envelope.protectedKey,
    protectedKeyCommitment: envelope.protectedKeyCommitment,
    accessControlHash: envelope.accessControlHash,
  });
  if (expectedIntegrity.integrityCommitment !== envelope.integrityCommitment) {
    throw new Error("TIN master-seed envelope integrity check failed");
  }
  return envelope;
}

export function decodeTinPublicRouteEnvelope(value: Uint8Array): TinPublicRouteEnvelope {
  const parsed = JSON.parse(textDecoder.decode(value)) as Partial<TinPublicRouteEnvelope>;
  if (
    parsed.version !== TIN_PUBLIC_ROUTE_ENVELOPE_VERSION ||
    parsed.algorithm !== TIN_PUBLIC_ROUTE_ENCRYPTION_ALGORITHM
  ) {
    throw new Error("TIN public-route envelope version or algorithm is unsupported");
  }
  if (!parsed.ephemeralPublicKey || !parsed.nonce || !parsed.ciphertext) {
    throw new Error("TIN public-route envelope is incomplete");
  }
  return parsed as TinPublicRouteEnvelope;
}

export function createTinPublicRoutePayload(params: {
  tin: string;
  routeVersion: number;
  routeNonce: string;
  pruConfigurationHash: string;
  prus: PruEndpoint[];
}): TinPublicRoutePayload {
  assertRouteVersion(params.routeVersion);
  assertHash32(params.routeNonce, "routeNonce");
  assertHash32(params.pruConfigurationHash, "pruConfigurationHash");
  return {
    version: TIN_PUBLIC_ROUTE_ENVELOPE_VERSION,
    tin: params.tin,
    routeVersion: params.routeVersion,
    routeNonce: params.routeNonce.toLowerCase(),
    pruConfigurationHash: params.pruConfigurationHash.toLowerCase(),
    prus: [...params.prus]
      .sort((left, right) => left.index - right.index)
      .map((pru) => ({
        index: pru.index,
        publicKey: new PublicKey(Buffer.from(pru.derivedPublicKey, "hex")).toBase58(),
        publicKeyHex: pru.derivedPublicKey.toLowerCase(),
        state: pru.state,
      })),
  };
}

export function encryptTinPublicRoutePayload(params: {
  payload: TinPublicRoutePayload;
  nodeRoutingPublicKeyBase64: string;
}): TinPublicRouteEnvelope {
  const nodePublicKey = base64ToBytes(params.nodeRoutingPublicKeyBase64, "Node routing public key");
  if (nodePublicKey.length !== nacl.box.publicKeyLength) {
    throw new Error("Node routing public key must be exactly 32 bytes");
  }
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  try {
    const ciphertext = nacl.box(
      textEncoder.encode(JSON.stringify(params.payload)),
      nonce,
      nodePublicKey,
      ephemeral.secretKey,
    );
    return {
      version: TIN_PUBLIC_ROUTE_ENVELOPE_VERSION,
      algorithm: TIN_PUBLIC_ROUTE_ENCRYPTION_ALGORITHM,
      ephemeralPublicKey: bytesToBase64(ephemeral.publicKey),
      nonce: bytesToBase64(nonce),
      ciphertext: bytesToBase64(ciphertext),
    };
  } finally {
    ephemeral.secretKey.fill(0);
  }
}
