import {
  fingerprintDeviceSigningPublicKey,
  fingerprintEncryptionPublicKey,
} from "./key-fingerprints.js";

export interface NonExportableSigningCredential {
  publicKey: JsonWebKey;
  privateKey: CryptoKey;
  fingerprint: string;
}

export interface NonExportableEncryptionCredential {
  keyId: string;
  publicKey: JsonWebKey;
  privateKey: CryptoKey;
}

export interface NonExportableDeviceCredentials {
  signing: NonExportableSigningCredential;
  encryption: NonExportableEncryptionCredential;
}

export async function generateNonExportableDeviceSigningCredential(): Promise<
  NonExportableSigningCredential
> {
  const pair = (await crypto.subtle.generateKey(
    "Ed25519",
    false,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    publicKey,
    privateKey: pair.privateKey,
    fingerprint: await fingerprintDeviceSigningPublicKey(publicKey),
  };
}

export async function generateNonExportableEncryptionCredential(
  keyPurpose: "device" | "recovery",
): Promise<NonExportableEncryptionCredential> {
  const pair = (await crypto.subtle.generateKey(
    { name: "X25519" },
    false,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    keyId: await fingerprintEncryptionPublicKey(publicKey, keyPurpose),
    publicKey,
    privateKey: pair.privateKey,
  };
}

export async function generateNonExportableDeviceCredentials(): Promise<
  NonExportableDeviceCredentials
> {
  const [signing, encryption] = await Promise.all([
    generateNonExportableDeviceSigningCredential(),
    generateNonExportableEncryptionCredential("device"),
  ]);
  return { signing, encryption };
}
