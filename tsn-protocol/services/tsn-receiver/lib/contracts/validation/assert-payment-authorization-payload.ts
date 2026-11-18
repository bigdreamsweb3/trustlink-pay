import { createPublicKey, verify as verifySignature } from "node:crypto";
import { AUTHORIZED_FUNDING_KEYS } from "../constants";
import { assertAllowlisted } from "./assert-allowlisted";
import { decodeBase58 } from "./decode-sender-base58";


/**
 * Validate the private funded-note opening and sender Ed25519 payment authorization shared by both stages.
 * Input: the explicit typed parameters below. Output: No return value on accepted ingress; Node still owns subsequent authorization/funding verification.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Mode/opening/allowlist/required-field errors and INVALID_SENDER_SIGNATURE.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function assertPaymentAuthorizationPayload(payload: Record<string, unknown>): void {
  assertAllowlisted(payload, AUTHORIZED_FUNDING_KEYS, "authorizedFunding");
  if (payload.senderFundingMode !== "tcap_funded_note_v1") throw new Error("FUNDED_NOTE_FUNDING_MODE_REQUIRED");
  const fundingNote = payload.fundingNote;
  if (!fundingNote || typeof fundingNote !== "object" || Array.isArray(fundingNote)) {
    throw new Error("FUNDED_NOTE_PRIVATE_OPENING_REQUIRED");
  }
  const note = fundingNote as Record<string, unknown>;
  assertAllowlisted(note, new Set(["version", "secret", "blinding", "commitment"]), "fundingNote");
  const scalarModulus = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  if (note.version !== 1) throw new Error("INVALID_FUNDED_NOTE_PRIVATE_OPENING");
  for (const field of ["secret", "blinding", "commitment"]) {
    const value = note[field];
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)
        || BigInt(`0x${value}`) >= scalarModulus
        || (field !== "blinding" && BigInt(`0x${value}`) === 0n)) {
      throw new Error("INVALID_FUNDED_NOTE_PRIVATE_OPENING");
    }
  }
  // Node resolves recipient and asset data before wallet deposit approval.
  for (const key of ["paymentId", "recipientHash", "recipientTin", "tokenMintAddress", "senderWallet", "senderAuthorizationMessage", "senderAuthorizationSignature", "senderAuthorizationNonce"]) {
    if (typeof payload[key] !== "string" || !String(payload[key]).trim()) throw new Error(`PAYMENT_AUTH_FIELD_REQUIRED:${key}`);
  }
  if (typeof payload.amount !== "number" && typeof payload.amount !== "string") throw new Error("PAYMENT_AUTH_FIELD_REQUIRED:amount");
  let signature: Buffer;
  try {
    signature = Buffer.from(String(payload.senderAuthorizationSignature).replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (signature.length !== 64) throw new Error("INVALID_SENDER_SIGNATURE");
    const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), decodeBase58(String(payload.senderWallet))]), format: "der", type: "spki" });
    if (!verifySignature(null, Buffer.from(String(payload.senderAuthorizationMessage), "utf8"), publicKey, signature)) throw new Error("INVALID_SENDER_SIGNATURE");
  } catch {
    throw new Error("INVALID_SENDER_SIGNATURE");
  }
}
