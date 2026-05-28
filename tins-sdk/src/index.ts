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

export const DEFAULT_TINS_PROGRAM_ID = new PublicKey(
  "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT"
);

export const PROGRAM_SALT = "TINS_SALT_2026";

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
  programId: PublicKey = DEFAULT_TINS_PROGRAM_ID
): [PublicKey, number] {
  const seed = getIdentitySeed(walletPubkey);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("identity", "utf8"), seed],
    programId
  );
}

export function getGlobalStatePda(
  programId: PublicKey = DEFAULT_TINS_PROGRAM_ID
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
  return crypto.hkdfSync(
    "sha256",
    walletSignatureSeed,
    identitySeed,
    Buffer.from("TINS_PHONE_KEY_INFO", "utf8"),
    32
  );
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

export function serializeCreateTinParams(
  displayName: string,
  encryptedPhone: Buffer
): Buffer {
  const nameBuf = Buffer.from(displayName, "utf8");
  const data = Buffer.alloc(1 + 4 + nameBuf.length + 4 + encryptedPhone.length);
  let offset = 0;

  // Tag 4 for CreateTin
  data.writeUInt8(4, offset);
  offset += 1;

  // display_name String (length prefix + bytes)
  data.writeUInt32LE(nameBuf.length, offset);
  offset += 4;
  nameBuf.copy(data, offset);
  offset += nameBuf.length;

  // encrypted_phone Vec<u8> (length prefix + bytes)
  data.writeUInt32LE(encryptedPhone.length, offset);
  offset += 4;
  encryptedPhone.copy(data, offset);

  return data;
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

export interface TinsClientConfig {
  rpcUrl?: string;
  programId?: PublicKey;
  connection?: Connection;
}

export interface TinsClient {
  connection: Connection;
  programId: PublicKey;
  createTin: (params: {
    wallet: {
      publicKey: PublicKey;
      signTransaction: (tx: Transaction) => Promise<Transaction>;
      signMessage: (msg: Uint8Array) => Promise<Uint8Array> | Uint8Array;
    };
    displayName: string;
    phoneNumber: string;
  }) => Promise<{ tin: bigint }>;
  resolveTin: (params: {
    wallet: {
      publicKey: PublicKey;
      signMessage: (msg: Uint8Array) => Promise<Uint8Array> | Uint8Array;
    };
  }) => Promise<bigint | null>;
}

export function createTinsClient(config: TinsClientConfig = {}): TinsClient {
  const connection =
    config.connection ??
    new Connection(config.rpcUrl ?? "http://127.0.0.1:8899", "confirmed");
  const programId = config.programId ?? DEFAULT_TINS_PROGRAM_ID;

  return {
    connection,
    programId,

    async createTin({ wallet, displayName, phoneNumber }) {
      const payer = wallet.publicKey;
      const [globalState] = getGlobalStatePda(programId);
      const [identity] = getIdentityPda(payer, programId);

      // Encrypt phone client-side
      const encryptedPhone = await encryptPhone(phoneNumber, wallet, payer);

      // Build serialized params and instruction
      const data = serializeCreateTinParams(displayName, encryptedPhone);
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: payer, isSigner: true, isWritable: true },
          { pubkey: globalState, isSigner: false, isWritable: true },
          { pubkey: identity, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data,
      });

      const tx = new Transaction().add(instruction);
      tx.feePayer = payer;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signedTx = await wallet.signTransaction(tx);
      const txid = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(txid, "confirmed");

      // Load resulting PDA account to fetch generated TIN
      const accountInfo = await connection.getAccountInfo(identity);
      if (!accountInfo) {
        throw new Error("TinAccount PDA failed to initialize");
      }

      const tin = accountInfo.data.readBigUInt64LE(0);
      return { tin };
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

      // 4. Build TINS ResolveTin instruction
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
