import { poseidon2 } from "poseidon-lite/poseidon2";
import { poseidon3 } from "poseidon-lite/poseidon3";
import { poseidon4 } from "poseidon-lite/poseidon4";

export const GPRU_FUNDING_FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const GPRU_FUNDING_NOTE_DOMAIN_V1 = 1880519585075378862971854540099064911735248433n;
export const GPRU_FUNDED_LEAF_DOMAIN_V1 = 7345779629200698683464734587914033020491313n;
export const GPRU_FUNDING_NULLIFIER_DOMAIN_V1 = 2067653150050877929286087838257825941301032058674988668465n;

/** Private opening: keep in sender memory and restricted payment ingress only. */
export type FundingNoteV1 = { version: 1; secret: string; blinding: string; commitment: string };

/** Validate 32-byte BN254 scalar hex; zero is permitted only when explicitly requested for blinding. */
export function canonicalFundingFieldHex(value: string, label = "Funding note field", allowZero = false): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${label} must be 32-byte hex`);
  const number = BigInt(`0x${value}`);
  if (number < 0n || (!allowZero && number === 0n) || number >= GPRU_FUNDING_FIELD_MODULUS) {
    throw new Error(`${label} must be a ${allowZero ? "" : "nonzero "}canonical BN254 scalar`);
  }
  return value.toLowerCase();
}

const hex = (value: bigint) => value.toString(16).padStart(64, "0");

/** Poseidon3(note domain, nonzero secret, canonical blinding). Blinding may be zero. */
export function deriveFundingNoteCommitmentV1(secret: string, blinding: string): string {
  return hex(poseidon3([GPRU_FUNDING_NOTE_DOMAIN_V1,
    BigInt(`0x${canonicalFundingFieldHex(secret, "Funding note secret")}`),
    BigInt(`0x${canonicalFundingFieldHex(blinding, "Funding note blinding", true)}`)]));
}

/** Require the exact four-field opening and recompute its nonzero commitment. */
export function assertFundingNoteV1(value: FundingNoteV1): FundingNoteV1 {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1
      || Object.keys(value).sort().join(",") !== "blinding,commitment,secret,version") {
    throw new Error("Funding note must contain exactly version, secret, blinding and commitment");
  }
  const note: FundingNoteV1 = { version: 1,
    secret: canonicalFundingFieldHex(value.secret, "Funding note secret"),
    blinding: canonicalFundingFieldHex(value.blinding, "Funding note blinding", true),
    commitment: canonicalFundingFieldHex(value.commitment, "Funding note commitment") };
  if (deriveFundingNoteCommitmentV1(note.secret, note.blinding) !== note.commitment) throw new Error("Funding note opening does not match its commitment");
  return note;
}

function randomField(): string {
  const bytes = new Uint8Array(32);
  // Rejection sampling avoids reduction bias and never accepts zero.
  for (;;) {
    globalThis.crypto.getRandomValues(bytes);
    bytes[0] &= 0x3f;
    const value = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    const number = BigInt(`0x${value}`);
    if (number > 0n && number < GPRU_FUNDING_FIELD_MODULUS) { bytes.fill(0); return value; }
  }
}

/** Generate before signing; no secret is inserted into the public deposit or credit. */
export function createFundingNoteV1(): FundingNoteV1 {
  const secret = randomField(), blinding = randomField();
  return assertFundingNoteV1({ version: 1, secret, blinding, commitment: deriveFundingNoteCommitmentV1(secret, blinding) });
}

/** Poseidon4(leaf domain, note commitment, registered token ID, actual transferred amount). */
export function deriveFundedLeafV1(noteCommitment: string, tokenId: number, amountBaseUnits: bigint): string {
  if (!Number.isInteger(tokenId) || tokenId <= 0 || tokenId > 0xffff_ffff
      || amountBaseUnits <= 0n || amountBaseUnits > 0xffff_ffff_ffff_ffffn) throw new Error("Funded leaf token or amount is outside its on-chain range");
  return hex(poseidon4([GPRU_FUNDED_LEAF_DOMAIN_V1,
    BigInt(`0x${canonicalFundingFieldHex(noteCommitment, "Funding note commitment")}`), BigInt(tokenId), amountBaseUnits]));
}

/** Poseidon2(nullifier domain, nonzero secret); public deposit signatures do not enter this relation. */
export function deriveFundingNullifierV1(secret: string): string {
  return hex(poseidon2([GPRU_FUNDING_NULLIFIER_DOMAIN_V1, BigInt(`0x${canonicalFundingFieldHex(secret, "Funding note secret")}`)]));
}
