import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import nacl from "tweetnacl";

/** GPRU is a derived settlement identity, never a token-account owner or balance container. */
export const GPRU_DERIVATION_DOMAIN = "TSN_GPRU_DERIVATION_V1";
export const GPRU_AUTHORIZATION_DOMAIN = "TSN_GPRU_AUTHORIZATION_V1";
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
