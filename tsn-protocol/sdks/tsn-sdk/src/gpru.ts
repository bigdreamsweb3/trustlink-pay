import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { ConfidentialKeys } from "@solana/zk-sdk";
import nacl from "tweetnacl";

export const GPRU_DERIVATION_DOMAIN = "TSN_GPRU_DERIVATION_V1";
export const GPRU_AUTHORIZATION_DOMAIN = "TSN_GPRU_AUTHORIZATION_V1";
export const GPRU_ELGAMAL_KEY_VERSION_V1 = 1 as const;
const GPRU_ELGAMAL_KEY_COMMITMENT_DOMAIN = "TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0";
const encoder = new TextEncoder();

export type GpruDerivationInput = {
  tinPrivacyReceivingRoot: Uint8Array | string;
  settlementCommitment: Uint8Array | string;
  epochContext: Uint8Array | string;
  authorizationScope: Uint8Array | string;
};
export type GpruAuthorization = GpruDerivationInput & { gpruIdentity: Uint8Array | string };

function bytes(value: Uint8Array | string, label: string): Uint8Array {
  const result = typeof value === "string" ? hexToBytes(value) : new Uint8Array(value);
  if (result.length === 0) throw new Error(`${label} must not be empty`);
  return result;
}
function fixed(value: Uint8Array | string, label: string): Uint8Array {
  const result = bytes(value, label);
  if (result.length !== 32) throw new Error(`${label} must be exactly 32 bytes`);
  return result;
}
function frame(value: Uint8Array): Uint8Array {
  if (value.length > 0xffff_ffff) throw new Error("GPRU field is too large");
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, value.length, false);
  return new Uint8Array([...length, ...value]);
}
function canonical(domain: string, input: GpruDerivationInput): Uint8Array {
  return new Uint8Array([
    ...frame(encoder.encode(domain)),
    ...frame(fixed(input.tinPrivacyReceivingRoot, "TIN privacy-receiving root")),
    ...frame(fixed(input.settlementCommitment, "settlement commitment")),
    ...frame(bytes(input.epochContext, "epoch context")),
    ...frame(bytes(input.authorizationScope, "authorization scope")),
  ]);
}
/** Domain-separated GPRU identity derivation. This output has no token-account semantics. */
export function deriveGpruIdentity(input: GpruDerivationInput): Uint8Array {
  return sha256(canonical(GPRU_DERIVATION_DOMAIN, input));
}
export function deriveGpruIdentityHex(input: GpruDerivationInput): string {
  return bytesToHex(deriveGpruIdentity(input));
}

/** Derive the versioned GPRU ElGamal public key from owner-held key material.
 * The derived secret key stays local and is released with the WASM key objects. */
export function deriveGpruElgamalPublicKey(masterSeed: Uint8Array): Uint8Array {
  if (!(masterSeed instanceof Uint8Array) || masterSeed.length < 32) {
    throw new Error("GPRU ElGamal derivation requires at least 32 bytes of owner key material");
  }
  const keys = ConfidentialKeys.fromIkm(masterSeed);
  const keypair = keys.elgamal();
  const publicKey = keypair.pubkey();
  try {
    const encoded = publicKey.toBytes();
    if (encoded.length !== 32 || encoded.every((value) => value === 0)) {
      throw new Error("Solana zk-sdk returned an invalid GPRU ElGamal public key");
    }
    return new Uint8Array(encoded);
  } finally {
    publicKey.free();
    keypair.free();
    keys.free();
  }
}

export function deriveGpruElgamalKeyCommitment(version: number, publicKey: Uint8Array): Uint8Array {
  if (version !== GPRU_ELGAMAL_KEY_VERSION_V1) throw new Error("Unsupported GPRU ElGamal key version");
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32 || publicKey.every((value) => value === 0)) {
    throw new Error("GPRU ElGamal public key must be a nonzero 32-byte value");
  }
  const input = new Uint8Array(encoder.encode(GPRU_ELGAMAL_KEY_COMMITMENT_DOMAIN).length + 1 + publicKey.length);
  const domain = encoder.encode(GPRU_ELGAMAL_KEY_COMMITMENT_DOMAIN);
  input.set(domain, 0);
  input[domain.length] = version;
  input.set(publicKey, domain.length + 1);
  return sha256(input);
}

/** Exact bytes an authorization signer must sign; fields are length-prefixed, not concatenated. */
export function createCanonicalGpruAuthorizationMessage(input: GpruAuthorization): Uint8Array {
  return new Uint8Array([
    ...canonical(GPRU_AUTHORIZATION_DOMAIN, input),
    ...frame(fixed(input.gpruIdentity, "GPRU identity")),
  ]);
}
export function verifyGpruAuthorizationBinding(input: GpruAuthorization): boolean {
  const expected = deriveGpruIdentity(input);
  const supplied = fixed(input.gpruIdentity, "GPRU identity");
  return nacl.verify(expected, supplied);
}
export function verifyGpruAuthorizationSignature(params: GpruAuthorization & {
  authorizationPublicKey: Uint8Array | string;
  signature: Uint8Array | string;
}): boolean {
  if (!verifyGpruAuthorizationBinding(params)) return false;
  const signature = bytes(params.signature, "GPRU authorization signature");
  if (signature.length !== nacl.sign.signatureLength) return false;
  return nacl.sign.detached.verify(
    createCanonicalGpruAuthorizationMessage(params), signature,
    fixed(params.authorizationPublicKey, "GPRU authorization public key"),
  );
}
