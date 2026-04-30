import { Keypair, PublicKey } from "@solana/web3.js";

export function generatePhoneIdentityKeypair() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    privateKey: Buffer.from(keypair.secretKey).toString("base64"),
  };
}

export function generateReceiverPrivacyRootKeypair() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    privateKey: Buffer.from(keypair.secretKey).toString("base64"),
  };
}

export function deserializePhoneIdentityKeypair(privateKey: string) {
  const secretKey = Buffer.from(privateKey, "base64");
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

export function normalizeIdentityPublicKey(value: string) {
  return new PublicKey(value).toBase58();
}
