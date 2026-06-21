import { Keypair, Transaction } from "@solana/web3.js";
import crypto from "node:crypto";

import {
  PROGRAM_SALT,
  getIdentitySeed,
  getIdentityPda,
  getGlobalStatePda,
  encryptPhone,
  decryptPhone,
  serializeCreateTinParams,
  serializeTinCreationRegistryParams,
  serializeResolveTinParams,
  createTinOwnerIntentHash,
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

  const keypair = Keypair.generate();
  const walletPubkey = keypair.publicKey;
  const mockWallet = {
    publicKey: walletPubkey,
    signMessage: (msg: Uint8Array) => {
      const pkcs8Header = Buffer.from(
        "302e020100300506032b657004220420",
        "hex",
      );
      const pkcs8Key = Buffer.concat([
        pkcs8Header,
        keypair.secretKey.subarray(0, 32),
      ]);
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

  console.log("\n[1] Testing deterministic derivations...");
  const identitySeed = getIdentitySeed(walletPubkey);
  assert(
    identitySeed.length === 32,
    "Identity seed must be a 32-byte SHA-256 hash",
  );

  const expectedSeed = crypto
    .createHash("sha256")
    .update(walletPubkey.toBuffer())
    .update(Buffer.from(PROGRAM_SALT, "utf8"))
    .digest();
  assert(
    identitySeed.equals(expectedSeed),
    "Identity seed mismatch with expected hash",
  );

  const [identityPda, identityBump] = getIdentityPda(walletPubkey);
  console.log("Identity PDA:", identityPda.toBase58(), "bump:", identityBump);

  const [globalStatePda, globalBump] = getGlobalStatePda();
  console.log("Global State PDA:", globalStatePda.toBase58(), "bump:", globalBump);

  console.log("\n[2] Testing client-side phone encryption...");
  const phoneNumber = "+2348123456789";
  const encryptedBlob = await encryptPhone(
    phoneNumber,
    mockWallet,
    walletPubkey,
  );
  assert(
    encryptedBlob.length > 28,
    "Encrypted blob must contain IV (12) + tag (16) + ciphertext",
  );

  const decryptedPhone = await decryptPhone(
    encryptedBlob,
    mockWallet,
    walletPubkey,
  );
  assert(
    decryptedPhone === phoneNumber,
    "Decrypted phone number does not match original",
  );

  console.log("\n[3] Testing TSN-mediated TINS serializers...");
  const displayName = "Alice Payne";
  const nonce = crypto.randomBytes(32);
  const expiryTs = Math.floor(Date.now() / 1000) + 600;
  const intentHash = createTinOwnerIntentHash({
    purpose: "create",
    ownerPubkey: walletPubkey,
    displayName,
    encryptedPhone: encryptedBlob,
    privacyLevel: 2,
    nonce,
    expiryTs,
  });
  const registryParams = serializeTinCreationRegistryParams({
    ownerPubkey: walletPubkey,
    displayName,
    encryptedPhone: encryptedBlob,
    privacyLevel: 2,
    intentHash,
    expiryTs,
  });

  assert(
    registryParams.readUInt8(0) === 12,
    "Cranker-mediated tin_creation_registry instruction tag must be 12",
  );
  assert(
    registryParams.subarray(1, 33).equals(walletPubkey.toBuffer()),
    "TIN registry owner pubkey mismatch",
  );

  let directCreateBlocked = false;
  try {
    serializeCreateTinParams();
  } catch {
    directCreateBlocked = true;
  }
  assert(directCreateBlocked, "Direct user-submitted CreateTin must remain disabled");

  const challengeNonce = crypto.randomBytes(32);
  const resolveParams = serializeResolveTinParams(walletPubkey, challengeNonce);
  assert(
    resolveParams.readUInt8(0) === 5,
    "ResolveTin instruction tag must be 5",
  );
  assert(
    resolveParams.subarray(1, 33).equals(walletPubkey.toBuffer()),
    "ResolveTin wallet pubkey mismatch",
  );
  assert(
    resolveParams.subarray(33, 65).equals(challengeNonce),
    "ResolveTin challenge nonce mismatch",
  );

  console.log("\n[4] Testing owner signature primitive...");
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
    signature,
  );
  assert(signatureValid, "Generated signature is invalid");

  console.log("\nAll TINS offline checks passed.");
}

main().catch((error) => {
  console.error("TINS offline checks failed.");
  console.error(error);
  process.exit(1);
});
