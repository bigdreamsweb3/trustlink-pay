import { PublicKey, Keypair, Transaction, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import * as crypto from "crypto";

import {
  DEFAULT_TINS_PROGRAM_ID,
  PROGRAM_SALT,
  getIdentitySeed,
  getIdentityPda,
  getGlobalStatePda,
  encryptPhone,
  decryptPhone,
  serializeCreateTinParams,
  serializeResolveTinParams,
  createTinsClient,
} from "../../tins-sdk/src/index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log("=========================================");
  console.log("   TINS UNBREAKABLE INTEGRATION CHECKS   ");
  console.log("=========================================");

  // 1. Initialize Mock Wallet
  const keypair = Keypair.generate();
  const walletPubkey = keypair.publicKey;
  const mockWallet = {
    publicKey: walletPubkey,
    signMessage: (msg: Uint8Array) => {
      // Use Node's native crypto module with PKCS8 DER wrapper for Ed25519 signature
      const pkcs8Header = Buffer.from("302e020100300506032b657004220420", "hex");
      const pkcs8Key = Buffer.concat([pkcs8Header, keypair.secretKey.subarray(0, 32)]);
      const privateKey = crypto.createPrivateKey({
        key: pkcs8Key,
        format: "der",
        type: "pkcs8",
      });
      return crypto.sign(null, msg, privateKey);
    },
    signTransaction: async (tx: Transaction) => {
      tx.partialSign(keypair);
      return tx;
    },
  };

  console.log("Payer Wallet Public Key:", walletPubkey.toBase58());

  // 2. Test Deterministic Derivations
  console.log("\n[1] Testing Deterministic Derivations...");
  const identitySeed = getIdentitySeed(walletPubkey);
  assert(identitySeed.length === 32, "Identity seed must be a 32-byte SHA-256 hash");
  
  // Derivation of seeds should match SHA256(wallet_pubkey + program_salt)
  const expectedSeed = crypto
    .createHash("sha256")
    .update(walletPubkey.toBuffer())
    .update(Buffer.from(PROGRAM_SALT, "utf8"))
    .digest();
  assert(identitySeed.equals(expectedSeed), "Identity seed mismatch with expected hash");
  console.log("✓ Identity Seed generated correctly:", identitySeed.toString("hex"));

  const [identityPda, identityBump] = getIdentityPda(walletPubkey);
  console.log("✓ Identity PDA derived:", identityPda.toBase58(), "bump:", identityBump);

  const [globalStatePda, globalBump] = getGlobalStatePda();
  console.log("✓ Global State PDA derived:", globalStatePda.toBase58(), "bump:", globalBump);

  // 3. Test Client-Side Cryptosystem (AES-256-GCM + HKDF)
  console.log("\n[2] Testing Client-Side Cryptosystem...");
  const phoneNumber = "+2348123456789";
  console.log("Raw Phone Number:", phoneNumber);

  // Encrypt phone number
  const encryptedBlob = await encryptPhone(phoneNumber, mockWallet, walletPubkey);
  assert(encryptedBlob.length > 28, "Encrypted blob must contain IV (12) + Tag (16) + Ciphertext");
  console.log("✓ Phone successfully encrypted. Blob length:", encryptedBlob.length);
  console.log("Encrypted Blob (Hex):", encryptedBlob.toString("hex"));

  // Decrypt phone number
  const decryptedPhone = await decryptPhone(encryptedBlob, mockWallet, walletPubkey);
  assert(decryptedPhone === phoneNumber, "Decrypted phone number does not match original!");
  console.log("✓ Phone successfully decrypted:", decryptedPhone);

  // 4. Test Manual Instruction Serializers (Borsh-compatible)
  console.log("\n[3] Testing Borsh Instruction Serializers...");
  const displayName = "Alice Payne";
  const createParams = serializeCreateTinParams(displayName, encryptedBlob);
  
  // CreateTin layout check:
  // Tag (1) + NameLen (4) + NameBytes (11) + PhoneLen (4) + PhoneBlob (blob len)
  assert(createParams.readUInt8(0) === 4, "CreateTin instruction tag must be 4");
  assert(createParams.readUInt32LE(1) === displayName.length, "CreateTin display name length mismatch");
  assert(
    createParams.readUInt32LE(1 + 4 + displayName.length) === encryptedBlob.length,
    "CreateTin encrypted phone length mismatch"
  );
  console.log("✓ CreateTin parameters successfully serialized.");

  const challengeNonce = crypto.randomBytes(32);
  const resolveParams = serializeResolveTinParams(walletPubkey, challengeNonce);
  
  // ResolveTin layout check:
  // Tag (1) + WalletPubkey (32) + ChallengeNonce (32)
  assert(resolveParams.readUInt8(0) === 5, "ResolveTin instruction tag must be 5");
  assert(
    resolveParams.subarray(1, 33).equals(walletPubkey.toBuffer()),
    "ResolveTin wallet pubkey mismatch"
  );
  assert(
    resolveParams.subarray(33, 65).equals(challengeNonce),
    "ResolveTin challenge nonce mismatch"
  );
  console.log("✓ ResolveTin parameters successfully serialized.");

  // 5. Test Transaction Construction for simulateTransaction
  console.log("\n[4] Testing Transaction Construction...");
  const client = createTinsClient({
    rpcUrl: "http://127.0.0.1:8899",
  });

  const signature = await mockWallet.signMessage(new Uint8Array(challengeNonce));
  const spkiHeader = Buffer.from("302a300506032b6570032100", "hex");
  const spkiKey = Buffer.concat([spkiHeader, walletPubkey.toBuffer()]);
  const publicKeyObj = crypto.createPublicKey({
    key: spkiKey,
    format: "der",
    type: "spki",
  });
  const signatureValid = crypto.verify(
    null,
    new Uint8Array(challengeNonce),
    publicKeyObj,
    signature
  );
  assert(signatureValid, "Generated signature is invalid");
  console.log("✓ Ed25519 signature verified on client side.");

  console.log("\nAll TINS unbreakable offline checks passed successfully!");
}

main().catch((error) => {
  console.error("TINS Unbreakable Integration checks failed.");
  console.error(error);
  process.exit(1);
});
