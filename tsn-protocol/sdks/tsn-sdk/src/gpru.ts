import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import nacl from "tweetnacl";

/** The TIN publishes a stable privacy-receiving root public key. For every
 * credit, GPRU combines that root with a fresh sender ephemeral key and the
 * public transaction context to derive a one-time recipient public key.
 */
export const GPRU_DERIVATION_DOMAIN = "TSN_GPRU_DERIVATION_V1";
export const GPRU_AUTHORIZATION_DOMAIN = "TSN_GPRU_AUTHORIZATION_V1";
export const TIN_PRIVACY_RECEIVING_KEY_DOMAIN = "TSN_TIN_PRIVACY_RECEIVING_KEY_V1";
export const TIN_PRIVACY_RECEIVING_KEY_COMMITMENT_DOMAIN = "TSN_TIN_PRIVACY_RECEIVING_KEY_COMMITMENT_V1";
export const TIP_ROOT_COMMITMENT_DOMAIN = "TSN_TIP_ROOT_COMMITMENT_V1";
export const GPRU_ROUTE_ROOT_COMMITMENT_DOMAIN = "TSN_GPRU_ROUTE_ROOT_COMMITMENT_V1";
export const GPRU_ROUTE_VERSION_V1 = 1 as const;
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

/** Derive the recipient's stable privacy-receiving root keypair from the TIN
 * owner master seed. Publish only the root public key in the TIP route associated with the TIN. GPRU
 * derives a fresh recipient public key for each transaction from this root.
 */
export function deriveTinPrivacyReceivingKeyPair(masterSeed: Uint8Array): nacl.BoxKeyPair {
  if (!(masterSeed instanceof Uint8Array) || masterSeed.length !== 32) {
    throw new Error("TIN master seed must be exactly 32 bytes");
  }
  const secretKey = sha256(new Uint8Array([
    ...encoder.encode(TIN_PRIVACY_RECEIVING_KEY_DOMAIN), 0, ...masterSeed,
  ]));
  try {
    return nacl.box.keyPair.fromSecretKey(secretKey);
  } finally {
    secretKey.fill(0);
  }
}

/** Commit to owner-held GPRU root material without publishing the seed or
 * reusing the legacy NaCl receiving public key as a proof-system key. */
export function deriveGpruRouteCommitment(masterSeed: Uint8Array): Uint8Array {
  if (!(masterSeed instanceof Uint8Array) || masterSeed.length !== 32) {
    throw new Error("TIN master seed must be exactly 32 bytes");
  }
  return sha256(new Uint8Array([
    ...encoder.encode(GPRU_ROUTE_ROOT_COMMITMENT_DOMAIN), 0, ...masterSeed,
  ]));
}

/** Derive the blinded TIP PDA seed from the public GPRU commitment.
 * The GPRU commitment is the public curve point; the owner's receiving scalar
 * stays local. TCAP receives only this domain-separated 32-byte hash.
 */
export function deriveTipRootCommitment(gpruPublicCommitment: Uint8Array): Uint8Array {
  if (!(gpruPublicCommitment instanceof Uint8Array) || gpruPublicCommitment.length !== nacl.box.publicKeyLength) {
    throw new Error("GPRU commitment must be exactly 32 bytes");
  }
  return sha256(new Uint8Array([
    ...encoder.encode(TIP_ROOT_COMMITMENT_DOMAIN), 0, ...gpruPublicCommitment,
  ]));
}

/** Legacy envelope-binding hash; not the TCAP TIP PDA seed. */
export function deriveTinPrivacyReceivingKeyCommitment(publicKey: Uint8Array): Uint8Array {
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== nacl.box.publicKeyLength) {
    throw new Error("TIN privacy-receiving public key must be exactly 32 bytes");
  }
  return sha256(new Uint8Array([
    ...encoder.encode(TIN_PRIVACY_RECEIVING_KEY_COMMITMENT_DOMAIN), 0, ...publicKey,
  ]));
}

/** Validate the active TIP route layout associated with a TIN and return its public GPRU point. */
export function resolveTinGpruPublicCommitment(
  gpruPublicCommitment: Uint8Array,
  tipRootCommitment: Uint8Array,
): Uint8Array | null {
  if (gpruPublicCommitment.length !== 32 || tipRootCommitment.length !== 32) return null;
  if (nacl.verify(deriveTipRootCommitment(gpruPublicCommitment), tipRootCommitment)) {
    return new Uint8Array(gpruPublicCommitment);
  }
  return null;
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

/**
 * Owner-authorized O(1) private balance read hook for the live GPRU/TCap
 * route.  GPRU itself never stores balances: the caller supplies the TCap tip
 * reader, opaque snapshot store, and local decrypt/verify function.  The
 * commitment from the tip is used as the only lookup key, so no PRU list or
 * token-account enumeration is required.
 */
export async function readGpruPrivateBalance<TTip extends {
  current_commitment: Uint8Array | string;
  sequence: bigint | number;
}, TSnapshot>(params: {
  fetchTip: () => Promise<TTip>;
  loadEncryptedSnapshot: (commitmentHex: string) => Promise<unknown | null>;
  decryptAndVerify: (envelope: unknown, tip: TTip) => Promise<TSnapshot>;
}): Promise<TSnapshot> {
  const tip = await params.fetchTip();
  const commitment = typeof tip.current_commitment === "string"
    ? tip.current_commitment.toLowerCase()
    : bytesToHex(tip.current_commitment);
  if (!/^[0-9a-f]{64}$/.test(commitment)) {
    throw new Error("TCap tip commitment must be exactly 32 bytes");
  }
  const envelope = await params.loadEncryptedSnapshot(commitment);
  if (!envelope) throw new Error("private snapshot not found");
  return params.decryptAndVerify(envelope, tip);
}
