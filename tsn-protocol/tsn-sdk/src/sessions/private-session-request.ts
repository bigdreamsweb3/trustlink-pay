import { canonicalFields, sha256Hex } from "../receipts/internal/encoding.js";

export interface PrivateSessionCreationRequest {
  sessionId: string;
  deviceId: string;
  sessionToken: string;
  permissions: string[];
  audience: string;
  issuedAt: string;
  expiresAt: string;
}

export function serializePrivateSessionCreationRequest(
  request: PrivateSessionCreationRequest,
): Uint8Array {
  return canonicalFields([
    "TSN_PRIVATE_SESSION_CREATION_V1",
    request.sessionId,
    request.deviceId,
    request.sessionToken,
    [...new Set(request.permissions)].sort().join(","),
    request.audience,
    request.issuedAt,
    request.expiresAt,
  ]);
}

export function createPrivateSessionRequestCommitment(
  request: PrivateSessionCreationRequest,
): Promise<string> {
  return sha256Hex(serializePrivateSessionCreationRequest(request));
}
