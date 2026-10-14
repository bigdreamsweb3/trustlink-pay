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
export const TCAP_TIN_TIP_ROOT_COMMITMENT_DOMAIN = "TSN_TCAP_TIN_TIP_ROOT_COMMITMENT_V1";
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
 * owner master seed. Publish only the root public key in the TIN route. GPRU
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

/** Derive TCAP's blinded TIP PDA seed from the public GPRU commitment.
 * The GPRU commitment is the public curve point; the owner's receiving scalar
 * stays local. TCAP receives only this domain-separated 32-byte hash.
 */
export function deriveTcapTipRootCommitment(gpruCommitment: Uint8Array): Uint8Array {
  if (!(gpruCommitment instanceof Uint8Array) || gpruCommitment.length !== nacl.box.publicKeyLength) {
    throw new Error("GPRU commitment must be exactly 32 bytes");
  }
  return sha256(new Uint8Array([
    ...encoder.encode(TCAP_TIN_TIP_ROOT_COMMITMENT_DOMAIN), 0, ...gpruCommitment,
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

/** Validate the active TIN route layout and return its public GPRU point. */
export function resolveTinGpruCommitment(
  relationshipCommitment: Uint8Array,
  relationshipReference: Uint8Array,
): Uint8Array | null {
  if (relationshipCommitment.length !== 32 || relationshipReference.length !== 32) return null;
  if (nacl.verify(deriveTcapTipRootCommitment(relationshipCommitment), relationshipReference)) {
    return new Uint8Array(relationshipCommitment);
  }
  return null;
}

export type GpruCreditNote = {
  amountBaseUnits: bigint;
  tokenId: number;
  sequence: bigint;
  previousCommitment: Uint8Array;
  policyCommitment: Uint8Array;
};

export type GpruCreditContext = {
  tipRootCommitment: Uint8Array;
  previousCommitment: Uint8Array;
  policyCommitment: Uint8Array;
  sequence: bigint;
  tokenId: number;
};

const GPRU_ONE_TIME_CREDIT_KEY_DOMAIN = "TSN_GPRU_ONE_TIME_CREDIT_KEY_V1";

function creditContextBytes(context: GpruCreditContext): Uint8Array {
  const sequence = new Uint8Array(8);
  new DataView(sequence.buffer).setBigUint64(0, context.sequence, true);
  const tokenId = new Uint8Array(4);
  new DataView(tokenId.buffer).setUint32(0, context.tokenId, true);
  return new Uint8Array([
    ...fixed(context.tipRootCommitment, "TIP root commitment"),
    ...fixed(context.previousCommitment, "previous commitment"),
    ...fixed(context.policyCommitment, "policy commitment"),
    ...sequence,
    ...tokenId,
  ]);
}

function deriveOneTimeCreditSecret(sharedRoot: Uint8Array, context: GpruCreditContext): Uint8Array {
  return sha256(new Uint8Array([
    ...encoder.encode(GPRU_ONE_TIME_CREDIT_KEY_DOMAIN), 0,
    ...sharedRoot,
    ...creditContextBytes(context),
  ]));
}

/** Encrypt one credit to a one-time recipient key. The sender needs only the
 * recipient's public root; the owner derives the matching one-time secret from
 * the root private key, the included ephemeral public key, and public context.
 * Envelope format: route ephemeral public key (32), one-time recipient public
 * key (32), then authenticated ciphertext.
 */
export function encryptGpruCreditNote(
  tinPrivacyReceivingRootPublicKey: Uint8Array,
  note: GpruCreditNote,
  context: GpruCreditContext,
): { envelope: Uint8Array; nonce: Uint8Array } {
  if (tinPrivacyReceivingRootPublicKey.length !== nacl.box.publicKeyLength) throw new Error("TIN privacy-receiving root public key must be 32 bytes");
  if (note.previousCommitment.length !== 32 || note.policyCommitment.length !== 32) throw new Error("GPRU credit commitments must be 32 bytes");
  if (note.amountBaseUnits <= 0n || note.amountBaseUnits > 0xffff_ffff_ffff_ffffn) throw new Error("GPRU credit amount is out of range");
  if (!Number.isSafeInteger(note.tokenId) || note.tokenId <= 0 || note.tokenId > 0xffff_ffff) throw new Error("GPRU token ID is out of range");
  if (note.sequence <= 0n || note.sequence > 0xffff_ffff_ffff_ffffn) throw new Error("GPRU sequence is out of range");
  const plaintext = new Uint8Array(84);
  const view = new DataView(plaintext.buffer);
  view.setBigUint64(0, note.amountBaseUnits, true);
  view.setUint32(8, note.tokenId, true);
  view.setBigUint64(12, note.sequence, true);
  plaintext.set(note.previousCommitment, 20);
  plaintext.set(note.policyCommitment, 52);
  if (context.sequence !== note.sequence || context.tokenId !== note.tokenId
    || !nacl.verify(context.previousCommitment, note.previousCommitment)
    || !nacl.verify(context.policyCommitment, note.policyCommitment)) {
    throw new Error("GPRU one-time key context must match the encrypted credit note");
  }
  const routeEphemeral = nacl.box.keyPair();
  const sharedRoot = nacl.box.before(tinPrivacyReceivingRootPublicKey, routeEphemeral.secretKey);
  const oneTimeSecret = deriveOneTimeCreditSecret(sharedRoot, context);
  const oneTimePair = nacl.box.keyPair.fromSecretKey(oneTimeSecret);
  const oneTimePublicKey = new Uint8Array(oneTimePair.publicKey);
  oneTimePair.secretKey.fill(0);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.secretbox(plaintext, nonce, oneTimeSecret);
  routeEphemeral.secretKey.fill(0);
  sharedRoot.fill(0);
  oneTimeSecret.fill(0);
  plaintext.fill(0);
  return { envelope: new Uint8Array([...routeEphemeral.publicKey, ...oneTimePublicKey, ...ciphertext]), nonce };
}

/** Decrypt one incoming note with the owner's locally recovered master seed.
 * Callers must supply the public transaction context and match the note fields
 * against the confirmed tip before applying it.
 */
export function decryptGpruCreditNote(
  masterSeed: Uint8Array,
  envelope: Uint8Array,
  nonce: Uint8Array,
  context: GpruCreditContext,
): GpruCreditNote {
  if (envelope.length !== 64 + 84 + nacl.secretbox.overheadLength) throw new Error("GPRU credit envelope length is invalid");
  if (nonce.length !== nacl.box.nonceLength) throw new Error("GPRU credit nonce length is invalid");
  const pair = deriveTinPrivacyReceivingKeyPair(masterSeed);
  const sharedRoot = nacl.box.before(envelope.subarray(0, 32), pair.secretKey);
  const oneTimeSecret = deriveOneTimeCreditSecret(sharedRoot, context);
  const oneTimePair = nacl.box.keyPair.fromSecretKey(oneTimeSecret);
  const publicKeyMatches = nacl.verify(oneTimePair.publicKey, envelope.subarray(32, 64));
  oneTimePair.secretKey.fill(0);
  if (!publicKeyMatches) {
    pair.secretKey.fill(0);
    sharedRoot.fill(0);
    oneTimeSecret.fill(0);
    throw new Error("GPRU one-time recipient key does not match this TIN and transaction");
  }
  const plaintext = nacl.secretbox.open(envelope.subarray(64), nonce, oneTimeSecret);
  pair.secretKey.fill(0);
  sharedRoot.fill(0);
  oneTimeSecret.fill(0);
  if (!plaintext || plaintext.length !== 84) throw new Error("GPRU credit note authentication failed");
  const view = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength);
  const note = {
    amountBaseUnits: view.getBigUint64(0, true),
    tokenId: view.getUint32(8, true),
    sequence: view.getBigUint64(12, true),
    previousCommitment: plaintext.slice(20, 52),
    policyCommitment: plaintext.slice(52, 84),
  };
  plaintext.fill(0);
  if (note.sequence !== context.sequence || note.tokenId !== context.tokenId
    || !nacl.verify(note.previousCommitment, context.previousCommitment)
    || !nacl.verify(note.policyCommitment, context.policyCommitment)) {
    note.previousCommitment.fill(0);
    note.policyCommitment.fill(0);
    throw new Error("GPRU credit note does not match its public transaction context");
  }
  return note;
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
