import nacl from "tweetnacl";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";

const SETTLEMENT_COMMITMENT_DOMAIN = utf8ToBytes("TSN_SETTLEMENT_V1");

export type TsnSettlementTokenPayload = {
  version: 1;
  transferId: string;
  paymentId: string;
  recipientWallet: string;
  tokenMintAddress: string;
  recipientAmountBaseUnits: string;
  claimFeeAmountBaseUnits: string;
  epoch: number;
  issuedAt: string;
  expiresAt: string;
  decryptionSecret: string;
};

export type TsnEncryptedSettlementToken = {
  algorithm: "x25519-xsalsa20-poly1305";
  ciphertextBase64: string;
  nonceBase64: string;
  ephemeralPublicKeyBase64: string;
  commitmentHash: string;
  transferId: string;
  epoch: number;
};

function randomBytes(length: number) {
  const output = new Uint8Array(length);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure Web Crypto random generation is required");
  }
  globalThis.crypto.getRandomValues(output);
  return output;
}

function toBase64(value: Uint8Array) {
  return Buffer.from(value).toString("base64");
}

function fromBase64(value: string, label: string) {
  const decoded = new Uint8Array(Buffer.from(value, "base64"));
  if (decoded.length === 0) throw new Error(`${label} is invalid`);
  return decoded;
}

function parseCurve25519Key(value: string, label: string) {
  const normalized = value.trim();
  const bytes = /^[0-9a-fA-F]{64}$/.test(normalized)
    ? hexToBytes(normalized)
    : fromBase64(normalized, label);
  if (bytes.length !== nacl.box.publicKeyLength) {
    throw new Error(`${label} must contain exactly ${nacl.box.publicKeyLength} bytes`);
  }
  return bytes;
}

function encodeU64(value: bigint | string | number, label: string) {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} is outside the u64 range`);
  }
  const bytes = new Uint8Array(8);
  let remaining = parsed;
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function computeSettlementCommitment(payload: TsnSettlementTokenPayload) {
  const transferId = hexToBytes(payload.transferId);
  const decryptionSecret = fromBase64(payload.decryptionSecret, "decryptionSecret");
  if (transferId.length !== 32 || decryptionSecret.length !== 32) {
    throw new Error("Settlement commitment inputs must contain 32-byte transfer and secret values");
  }
  const recipient = new PublicKey(payload.recipientWallet).toBytes();
  const mint = new PublicKey(payload.tokenMintAddress).toBytes();
  return bytesToHex(
    sha256(
      concatBytes([
        SETTLEMENT_COMMITMENT_DOMAIN,
        transferId,
        recipient,
        mint,
        encodeU64(payload.recipientAmountBaseUnits, "recipientAmountBaseUnits"),
        encodeU64(payload.claimFeeAmountBaseUnits, "claimFeeAmountBaseUnits"),
        encodeU64(payload.epoch, "epoch"),
        decryptionSecret,
      ]),
    ),
  );
}

export function createTsnTransferId(paymentId: string) {
  return bytesToHex(sha256(utf8ToBytes(`TSN_TRANSFER_V1:${paymentId}`)));
}

export function createOneTimeDecryptionToken() {
  const token = randomBytes(32);
  return {
    token,
    tokenBase64: toBase64(token),
    hash: bytesToHex(sha256(token)),
  };
}

export function createCrankerEncryptionKeypair() {
  const keypair = nacl.box.keyPair();
  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
    publicKeyBase64: toBase64(keypair.publicKey),
    secretKeyBase64: toBase64(keypair.secretKey),
  };
}

export function buildSettlementTokenPayload(params: {
  paymentId: string;
  recipientWallet: string;
  tokenMintAddress: string;
  recipientAmountBaseUnits: bigint | string;
  claimFeeAmountBaseUnits?: bigint | string;
  epoch: number;
  issuedAt?: string;
  expiresAt: string;
  decryptionSecret?: Uint8Array;
}): TsnSettlementTokenPayload {
  const decryptionSecret = params.decryptionSecret ?? randomBytes(32);
  if (decryptionSecret.length !== 32) {
    throw new Error("decryptionSecret must contain exactly 32 bytes");
  }
  return {
    version: 1,
    transferId: createTsnTransferId(params.paymentId),
    paymentId: params.paymentId,
    recipientWallet: params.recipientWallet,
    tokenMintAddress: params.tokenMintAddress,
    recipientAmountBaseUnits: String(params.recipientAmountBaseUnits),
    claimFeeAmountBaseUnits: String(params.claimFeeAmountBaseUnits ?? 0),
    epoch: params.epoch,
    issuedAt: params.issuedAt ?? new Date().toISOString(),
    expiresAt: params.expiresAt,
    decryptionSecret: toBase64(decryptionSecret),
  };
}

export function encryptSettlementToken(params: {
  payload: TsnSettlementTokenPayload;
  routeEncryptionPublicKey?: string;
  crankerEncryptionPublicKey?: string;
}): TsnEncryptedSettlementToken {
  const routeEncryptionPublicKey =
    params.routeEncryptionPublicKey ?? params.crankerEncryptionPublicKey;
  if (!routeEncryptionPublicKey) {
    throw new Error("routeEncryptionPublicKey is required");
  }
  const recipientPublicKey = parseCurve25519Key(
    routeEncryptionPublicKey,
    "routeEncryptionPublicKey",
  );
  const ephemeral = nacl.box.keyPair();
  const nonce = randomBytes(nacl.box.nonceLength);
  const plaintext = utf8ToBytes(JSON.stringify(params.payload));
  const ciphertext = nacl.box(plaintext, nonce, recipientPublicKey, ephemeral.secretKey);
  if (!ciphertext) throw new Error("Could not encrypt TSN settlement token");

  return {
    algorithm: "x25519-xsalsa20-poly1305",
    ciphertextBase64: toBase64(ciphertext),
    nonceBase64: toBase64(nonce),
    ephemeralPublicKeyBase64: toBase64(ephemeral.publicKey),
    commitmentHash: computeSettlementCommitment(params.payload),
    transferId: params.payload.transferId,
    epoch: params.payload.epoch,
  };
}

export function decryptSettlementToken(params: {
  encrypted: TsnEncryptedSettlementToken;
  crankerEncryptionSecretKey: string;
}): TsnSettlementTokenPayload {
  const secretKey = parseCurve25519Key(
    params.crankerEncryptionSecretKey,
    "crankerEncryptionSecretKey",
  );
  const nonce = fromBase64(params.encrypted.nonceBase64, "nonceBase64");
  const ephemeralPublicKey = fromBase64(
    params.encrypted.ephemeralPublicKeyBase64,
    "ephemeralPublicKeyBase64",
  );
  const ciphertext = fromBase64(params.encrypted.ciphertextBase64, "ciphertextBase64");
  if (nonce.length !== nacl.box.nonceLength) throw new Error("Invalid settlement token nonce");
  if (ephemeralPublicKey.length !== nacl.box.publicKeyLength) {
    throw new Error("Invalid settlement token ephemeral public key");
  }

  const plaintext = nacl.box.open(ciphertext, nonce, ephemeralPublicKey, secretKey);
  if (!plaintext) throw new Error("Settlement token decryption failed");
  const payload = JSON.parse(Buffer.from(plaintext).toString("utf8")) as TsnSettlementTokenPayload;
  const commitmentHash = computeSettlementCommitment(payload);
  if (commitmentHash !== params.encrypted.commitmentHash) {
    throw new Error("Settlement token commitment mismatch");
  }
  if (payload.transferId !== params.encrypted.transferId) {
    throw new Error("Settlement token transfer id mismatch");
  }
  if (payload.epoch !== params.encrypted.epoch) {
    throw new Error("Settlement token epoch mismatch");
  }
  return payload;
}

export function decodeSettlementSecret(value: string) {
  const secret = fromBase64(value, "decryptionSecret");
  if (secret.length !== 32) throw new Error("decryptionSecret must contain exactly 32 bytes");
  return secret;
}
