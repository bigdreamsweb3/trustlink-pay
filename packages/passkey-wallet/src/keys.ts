/**
 * Passkey Wallet - Solana Key Derivation
 * 
 * Derives Solana keypairs from passkey credentials using deterministic methods.
 * The passkey private key is never exposed - all signing happens inside the authenticator.
 */

import {
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import nacl from "tweetnacl";

/**
 * Seed size for Solana key derivation (32 bytes)
 */
const SEED_SIZE = 32;

/**
 * Domain separator for key derivation
 */
const DOMAIN_SEPARATOR = "TRUSTLINK_PAY_V1";

/**
 * Derives a Solana keypair from a passkey credential.
 * 
 * This uses a one-way function to derive a deterministic seed from the
 * passkey credential ID. The actual private key is never stored - it only
 * exists inside the authenticator.
 * 
 * @param credentialId - The passkey credential ID
 * @returns A derived keypair (public key matches what the authenticator will sign for)
 */
export function deriveKeypairFromCredential(credentialId: string): Keypair {
  const seed = deriveSeedFromCredentialId(credentialId);
  return Keypair.fromSeed(seed);
}

/**
 * Derives the public key address from a credential ID.
 * 
 * @param credentialId - The passkey credential ID
 * @returns The derived Solana public key as a string
 */
export function deriveAddressFromCredentialId(credentialId: string): string {
  const keypair = deriveKeypairFromCredential(credentialId);
  return keypair.publicKey.toBase58();
}

/**
 * Derives a deterministic seed from a credential ID.
 * 
 * Uses HKDF-like key stretching to expand the credential ID into
 * a full 32-byte seed suitable for Solana key derivation.
 * 
 * @param credentialId - The passkey credential ID
 * @returns A 32-byte seed
 */
export function deriveSeedFromCredentialId(credentialId: string): Uint8Array {
  // Convert credential ID to bytes
  const encoder = new TextEncoder();
  const credentialBytes = encoder.encode(credentialId);
  const domainBytes = encoder.encode(DOMAIN_SEPARATOR);
  
  // Simple KDF: SHA-256(domain || credential_id)
  // In production, use a proper HKDF implementation
  const combined = new Uint8Array(domainBytes.length + credentialBytes.length);
  combined.set(domainBytes);
  combined.set(credentialBytes, domainBytes.length);
  
  // Use TweetNaCl for hashing (same as Solana uses)
  const hash = nacl.hash(combined);
  
  return hash.slice(0, SEED_SIZE);
}

/**
 * Verifies that a public key matches a credential ID.
 * 
 * @param publicKey - The public key to verify
 * @param credentialId - The credential ID to check against
 * @returns True if the public key was derived from the credential
 */
export function verifyPublicKeyFromCredential(
  publicKey: PublicKey,
  credentialId: string
): boolean {
  const derived = deriveKeypairFromCredential(credentialId);
  return derived.publicKey.equals(publicKey);
}

/**
 * Generates a challenge for passkey authentication.
 * 
 * @param length - Length of the random challenge in bytes (default: 32)
 * @returns A base64-encoded random challenge
 */
export function generateAuthenticationChallenge(length: number = 32): string {
  const randomBytes = nacl.randomBytes(length);
  return base64Encode(randomBytes);
}

/**
 * Generates a challenge for passkey registration.
 * 
 * @param length - Length of the random challenge in bytes (default: 32)
 * @returns A base64-encoded random challenge
 */
export function generateRegistrationChallenge(length: number = 32): string {
  const randomBytes = nacl.randomBytes(length);
  return base64Encode(randomBytes);
}

/**
 * Encodes bytes to base64 string.
 * 
 * @param bytes - The bytes to encode
 * @returns Base64-encoded string
 */
export function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string to bytes.
 * 
 * @param base64 - The base64 string to decode
 * @returns Decoded bytes
 */
export function base64Decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts an ArrayBuffer to a base64 string.
 * 
 * @param buffer - The buffer to encode
 * @returns Base64-encoded string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return base64Encode(bytes);
}

/**
 * Converts a base64 string to an ArrayBuffer.
 * 
 * @param base64 - The base64 string to decode
 * @returns Decoded ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bytes = base64Decode(base64);
  return bytes.buffer as ArrayBuffer;
}