import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  TransactionInstruction,
  Ed25519Program,
} from "@solana/web3.js";
import * as crypto from "crypto";

export const DEFAULT_TIP_PROGRAM_ID = new PublicKey(
  "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT"
);
const DEFAULT_SOLANA_RPC_URL = "https://api.devnet.solana.com";

export const PROGRAM_SALT = "TINS_SALT_2026";
export const DEFAULT_TIN_PRU_COUNT = 30;

const ZERO_HASH_32 = Buffer.alloc(32);

function resolveSolanaRpcUrl() {
  const configured = process.env.TSN_SOLANA_RPC_URLS?.split(/[,\s]+/g)
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .find(Boolean);
  return configured ?? DEFAULT_SOLANA_RPC_URL;
}

function createSolanaConnection() {
  return new Connection(resolveSolanaRpcUrl(), "confirmed");
}

function normalizeHash32(value: Buffer | Uint8Array | undefined, label: string): Buffer {
  if (!value) return ZERO_HASH_32;
  const buffer = Buffer.from(value);
  if (buffer.length !== 32) throw new Error(`${label} must be exactly 32 bytes`);
  return buffer;
}

// ==========================================
// 1. DERIVATION & CRYPTO HELPERS (CLIENT-SIDE)
// ==========================================

export function getIdentitySeed(walletPubkey: PublicKey): Buffer {
  const hasher = crypto.createHash("sha256");
  hasher.update(walletPubkey.toBuffer());
  hasher.update(Buffer.from(PROGRAM_SALT, "utf8"));
  return hasher.digest();
}

export function getIdentityPda(
  walletPubkey: PublicKey,
  programId: PublicKey = DEFAULT_TIP_PROGRAM_ID
): [PublicKey, number] {
  const seed = getIdentitySeed(walletPubkey);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("identity", "utf8"), seed],
    programId
  );
}

export function getGlobalStatePda(
  programId: PublicKey = DEFAULT_TIP_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global-state", "utf8")],
    programId
  );
}

export function derivePhoneKey(
  walletSignatureSeed: Buffer,
  identitySeed: Buffer
): Buffer {
  // phone_key = HKDF(wallet_signature_seed + identity_seed)
  return Buffer.from(crypto.hkdfSync(
    "sha256",
    walletSignatureSeed,
    identitySeed,
    Buffer.from("TINS_PHONE_KEY_INFO", "utf8"),
    32
  ));
}

export async function encryptPhone(
  phoneNumber: string,
  wallet: { signMessage: (msg: Uint8Array) => Promise<Uint8Array> | Uint8Array },
  walletPubkey: PublicKey
): Promise<Buffer> {
  const message = Buffer.from("TINS_PHONE_ENCRYPTION_SEED", "utf8");
  const signature = await wallet.signMessage(message);
  const walletSignatureSeed = Buffer.from(signature);
  const identitySeed = getIdentitySeed(walletPubkey);
  const phoneKey = derivePhoneKey(walletSignatureSeed, identitySeed);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", phoneKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(phoneNumber, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  // Combined encrypted payload blob: IV (12) + AuthTag (16) + Ciphertext
  return Buffer.concat([iv, authTag, ciphertext]);
}

export async function decryptPhone(
  encryptedBlob: Buffer,
  wallet: { signMessage: (msg: Uint8Array) => Promise<Uint8Array> | Uint8Array },
  walletPubkey: PublicKey
): Promise<string> {
  const message = Buffer.from("TINS_PHONE_ENCRYPTION_SEED", "utf8");
  const signature = await wallet.signMessage(message);
  const walletSignatureSeed = Buffer.from(signature);
  const identitySeed = getIdentitySeed(walletPubkey);
  const phoneKey = derivePhoneKey(walletSignatureSeed, identitySeed);

  if (encryptedBlob.length < 28) {
    throw new Error("Invalid encrypted phone blob");
  }

  const iv = encryptedBlob.subarray(0, 12);
  const authTag = encryptedBlob.subarray(12, 28);
  const ciphertext = encryptedBlob.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", phoneKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ==========================================
// 2. BINARY INSTRUCTION SERIALIZERS (BORSH)
// ==========================================

export function serializeTinCreationRegistryParams(params: {
  ownerPubkey: PublicKey;
  displayName: string;
  encryptedMasterSeed: Buffer;
  encryptedMetadataHash?: Buffer | Uint8Array;
  pruConfigurationHash?: Buffer | Uint8Array;
  intentHash: Buffer | Uint8Array;
  expiryTs: bigint | number;
}): Buffer {
  return serializeTinRegistryMutationParams(12, params);
}

export function serializeTinUpdateParams(params: {
  ownerPubkey: PublicKey;
  displayName: string;
  encryptedMasterSeed: Buffer;
  encryptedMetadataHash?: Buffer | Uint8Array;
  pruConfigurationHash?: Buffer | Uint8Array;
  intentHash: Buffer | Uint8Array;
  expiryTs: bigint | number;
}): Buffer {
  return serializeTinRegistryMutationParams(13, params);
}

/** @deprecated Direct user-signed CreateTin is disabled. Use serializeTinCreationRegistryParams after a TSN Cranker verifies the owner intent. */
export function serializeCreateTinParams(): Buffer {
  throw new Error("Direct TIP create is disabled; submit a TSN TIN creation intent and let a Cranker call tin_creation_registry");
}

function serializeTinRegistryMutationParams(
  tag: 12 | 13,
  params: {
    ownerPubkey: PublicKey;
    displayName: string;
    encryptedMasterSeed: Buffer;
    encryptedMetadataHash?: Buffer | Uint8Array;
    pruConfigurationHash?: Buffer | Uint8Array;
    intentHash: Buffer | Uint8Array;
    expiryTs: bigint | number;
  }
): Buffer {
  const nameBuf = Buffer.from(params.displayName, "utf8");
  const metadataHash = normalizeHash32(params.encryptedMetadataHash, "encryptedMetadataHash");
  const configurationHash = normalizeHash32(params.pruConfigurationHash, "pruConfigurationHash");
  const intentHash = normalizeHash32(params.intentHash, "intentHash");
  const data = Buffer.alloc(1 + 32 + 4 + nameBuf.length + 4 + params.encryptedMasterSeed.length + 32 + 32 + 32 + 8);
  let offset = 0;

  data.writeUInt8(tag, offset);
  offset += 1;
  params.ownerPubkey.toBuffer().copy(data, offset);
  offset += 32;
  data.writeUInt32LE(nameBuf.length, offset);
  offset += 4;
  nameBuf.copy(data, offset);
  offset += nameBuf.length;
  data.writeUInt32LE(params.encryptedMasterSeed.length, offset);
  offset += 4;
  params.encryptedMasterSeed.copy(data, offset);
  offset += params.encryptedMasterSeed.length;
  metadataHash.copy(data, offset);
  offset += 32;
  configurationHash.copy(data, offset);
  offset += 32;
  intentHash.copy(data, offset);
  offset += 32;
  data.writeBigInt64LE(BigInt(params.expiryTs), offset);

  return data;
}

export function createTinOwnerIntentHash(params: {
  purpose: "create" | "update";
  ownerPubkey: PublicKey;
  displayName: string;
  nonce: Buffer | Uint8Array;
  expiryTs: bigint | number;
}): Buffer {
  const hash = crypto.createHash("sha256");
  hash.update(Buffer.from(`TINS_${params.purpose.toUpperCase()}_INTENT_V1`, "utf8"));
  hash.update(params.ownerPubkey.toBuffer());
  hash.update(Buffer.from(params.displayName, "utf8"));
  hash.update(normalizeHash32(params.nonce, "nonce"));
  const expiry = Buffer.alloc(8);
  expiry.writeBigInt64LE(BigInt(params.expiryTs));
  hash.update(expiry);
  return hash.digest();
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

export function serializeResolveTinParams(
  walletPubkey: PublicKey,
  challengeNonce: Buffer
): Buffer {
  const data = Buffer.alloc(1 + 32 + 32);

  // Tag 5 for ResolveTin
  data.writeUInt8(5, 0);

  // wallet_pubkey (32 bytes)
  walletPubkey.toBuffer().copy(data, 1);

  // challenge_nonce (32 bytes)
  challengeNonce.copy(data, 1 + 32);

  return data;
}

// ==========================================
// 3. CORE SDK CLIENT INTERFACE
// ==========================================

export interface TipClientConfig {
  rpcUrl?: string;
  programId?: PublicKey;
  connection?: Connection;
}

export interface TipClient {
  connection: Connection;
  programId: PublicKey;
  /** @deprecated Direct TIP creation is disabled. Use TSN Mempool runtime + Cranker tin_creation_registry. */
  createTin: () => Promise<never>;
  resolveTin: (params: {
    wallet: {
      publicKey: PublicKey;
      signMessage: (msg: Uint8Array) => Promise<Uint8Array> | Uint8Array;
    };
  }) => Promise<bigint | null>;
}

export function createTipClient(config: TipClientConfig = {}): TipClient {
  const connection = config.connection ?? createSolanaConnection();
  const programId = config.programId ?? DEFAULT_TIP_PROGRAM_ID;

  return {
    connection,
    programId,

    async createTin() {
      throw new Error("Direct TIP create is disabled; submit a TSN TIN creation intent and wait for Cranker-mediated tin_creation_registry");
    },

    async resolveTin({ wallet }) {
      const walletPubkey = wallet.publicKey;
      const [identity] = getIdentityPda(walletPubkey, programId);

      // 1. Generate unique challenge nonce
      const challengeNonce = crypto.randomBytes(32);

      // 2. Request signature of challenge nonce from wallet
      const signature = await wallet.signMessage(new Uint8Array(challengeNonce));

      // 3. Build prepended Ed25519 sig verify instruction
      const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
        publicKey: walletPubkey.toBytes(),
        message: challengeNonce,
        signature: signature,
      });

      // 4. Build TIP ResolveTin instruction
      const data = serializeResolveTinParams(walletPubkey, challengeNonce);
      const resolveInstruction = new TransactionInstruction({
        keys: [
          { pubkey: identity, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId,
        data,
      });

      // 5. Construct transaction and simulate to execute signature check and read returnData
      const tx = new Transaction().add(ed25519Instruction).add(resolveInstruction);
      tx.feePayer = walletPubkey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const simulation = await connection.simulateTransaction(tx);
      if (simulation.value.err) {
        // If simulation fails (e.g. signature mismatch or account uninitialized), return null
        return null;
      }

      const returnData = simulation.value.returnData;
      if (!returnData || !returnData.data) {
        return null;
      }

      const [base64Data, encoding] = returnData.data;
      if (encoding !== "base64") {
        throw new Error("Invalid returnData encoding");
      }

      const tinBuffer = Buffer.from(base64Data, "base64");
      return tinBuffer.readBigUInt64LE(0);
    },
  };
}
