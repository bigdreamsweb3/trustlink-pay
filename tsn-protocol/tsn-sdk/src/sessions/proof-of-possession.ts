import { canonicalFields, sha256Hex, toArrayBuffer } from "../receipts/internal/encoding.js";

export const TSN_SESSION_PROOF_VERSION = "tsn-session-proof-v1";
export const TSN_SESSION_PROOF_DOMAIN = "TSN_PRIVATE_REQUEST_PROOF";

export interface SessionProofClaims {
  protocolVersion: typeof TSN_SESSION_PROOF_VERSION;
  domain: typeof TSN_SESSION_PROOF_DOMAIN;
  sessionId: string;
  deviceId: string;
  deviceSigningKeyFingerprint: string;
  permission: string;
  method: string;
  resource: string;
  bodyCommitment: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  audience: string;
}

export interface SignedSessionProof extends SessionProofClaims {
  signatureBase64Url: string;
}

export function serializeSessionProof(claims: SessionProofClaims): Uint8Array {
  return canonicalFields([
    claims.domain,
    claims.protocolVersion,
    claims.sessionId,
    claims.deviceId,
    claims.deviceSigningKeyFingerprint,
    claims.permission,
    claims.method.toUpperCase(),
    claims.resource,
    claims.bodyCommitment,
    claims.nonce,
    claims.issuedAt,
    claims.expiresAt,
    claims.audience,
  ]);
}

export async function createRequestBodyCommitment(body: Uint8Array): Promise<string> {
  return sha256Hex(body);
}

export async function signSessionProof(
  claims: SessionProofClaims,
  deviceSigningPrivateKey: CryptoKey,
): Promise<SignedSessionProof> {
  const signature = await crypto.subtle.sign(
    "Ed25519",
    deviceSigningPrivateKey,
    toArrayBuffer(serializeSessionProof(claims)),
  );
  return { ...claims, signatureBase64Url: Buffer.from(signature).toString("base64url") };
}

export async function verifySessionProof(params: {
  proof: SignedSessionProof;
  deviceSigningPublicKey: JsonWebKey;
  expectedSessionId: string;
  expectedDeviceId: string;
  expectedPermission: string;
  expectedMethod: string;
  expectedResource: string;
  expectedBodyCommitment: string;
  expectedAudience: string;
  sessionExpiresAt: string;
  deviceStatus: "active" | "revoked" | "expired";
  now?: Date;
  consumeNonce: (nonce: string) => boolean;
}): Promise<{ valid: true } | { valid: false; reason: string }> {
  const proof = params.proof;
  if (proof.protocolVersion !== TSN_SESSION_PROOF_VERSION || proof.domain !== TSN_SESSION_PROOF_DOMAIN) return { valid: false, reason: "unsupported-proof-domain" };
  if (params.deviceStatus !== "active") return { valid: false, reason: "device-not-active" };
  if (proof.sessionId !== params.expectedSessionId || proof.deviceId !== params.expectedDeviceId) return { valid: false, reason: "session-device-mismatch" };
  if (proof.permission !== params.expectedPermission) return { valid: false, reason: "permission-mismatch" };
  if (proof.method.toUpperCase() !== params.expectedMethod.toUpperCase() || proof.resource !== params.expectedResource) return { valid: false, reason: "request-target-mismatch" };
  if (proof.bodyCommitment !== params.expectedBodyCommitment) return { valid: false, reason: "body-mismatch" };
  if (proof.audience !== params.expectedAudience) return { valid: false, reason: "audience-mismatch" };

  const now = (params.now ?? new Date()).getTime();
  const issuedAt = Date.parse(proof.issuedAt);
  const expiresAt = Date.parse(proof.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now || expiresAt <= now || Date.parse(params.sessionExpiresAt) <= now) {
    return { valid: false, reason: "proof-or-session-expired" };
  }

  const publicKey = await crypto.subtle.importKey("jwk", params.deviceSigningPublicKey, "Ed25519", false, ["verify"]);
  const signatureValid = await crypto.subtle.verify(
    "Ed25519",
    publicKey,
    Buffer.from(proof.signatureBase64Url, "base64url"),
    toArrayBuffer(serializeSessionProof(proof)),
  );
  if (!signatureValid) return { valid: false, reason: "invalid-device-signature" };
  if (!params.consumeNonce(proof.nonce)) return { valid: false, reason: "nonce-reused" };
  return { valid: true };
}

export { generateNonExportableDeviceSigningCredential } from "../device/non-exportable-credentials.js";
