import {
  createPrivateSessionRequestCommitment,
  type PrivateSessionCreationRequest,
} from "../private-session-request.js";
import {
  verifySessionProof,
  type SignedSessionProof,
} from "../proof-of-possession.js";

export interface TsnAuthorizedDeviceVerificationRecord {
  deviceId: string;
  tinCommitment: string;
  signingKeyFingerprint: string;
  signingPublicKey: JsonWebKey;
  encryptionKeyFingerprint: string;
  permissions: string[];
  status: "active" | "revoked" | "expired";
}

export interface TsnPrivateSessionVerificationRecord {
  sessionId: string;
  tinCommitment: string;
  deviceId: string;
  permissions: string[];
  audience: string;
  expiresAt: string;
  status: "active" | "revoked" | "expired";
}

export async function verifyTsnPrivateSessionCreation(params: {
  request: PrivateSessionCreationRequest;
  proof: SignedSessionProof;
  device: TsnAuthorizedDeviceVerificationRecord;
  expectedAudience: string;
  expectedResource: string;
  maxTtlMs?: number;
  now?: Date;
  consumeNonce: (params: {
    nonce: string;
    deviceId: string;
    sessionId: string;
    purpose: string;
    expiresAt: string;
  }) => Promise<boolean>;
}): Promise<{ permissions: string[] }> {
  const now = params.now ?? new Date();
  if (params.device.status !== "active") throw new Error("Authorized device is not active");
  if (!params.device.permissions.includes("private-session:create")) {
    throw new Error("Device is not permitted to create private sessions");
  }
  if (params.request.deviceId !== params.device.deviceId) throw new Error("Private session device mismatch");
  if (params.request.audience !== params.expectedAudience) throw new Error("Private session audience mismatch");
  if (params.proof.deviceSigningKeyFingerprint !== params.device.signingKeyFingerprint) {
    throw new Error("Private session proof uses an unregistered signing key");
  }

  const permissions = [...new Set(params.request.permissions)].sort();
  if (
    permissions.length === 0 ||
    permissions.some((permission) => !params.device.permissions.includes(permission))
  ) {
    throw new Error("Private session requests a permission not granted to this device");
  }
  const issuedAt = Date.parse(params.request.issuedAt);
  const expiresAt = Date.parse(params.request.expiresAt);
  const maxTtlMs = params.maxTtlMs ?? 2 * 60 * 60 * 1_000;
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    issuedAt > now.getTime() ||
    expiresAt <= now.getTime() ||
    expiresAt - issuedAt > maxTtlMs
  ) {
    throw new Error("Private session timing is invalid");
  }

  const bodyCommitment = await createPrivateSessionRequestCommitment({
    ...params.request,
    permissions,
  });
  const verification = await verifySessionProof({
    proof: params.proof,
    deviceSigningPublicKey: params.device.signingPublicKey,
    expectedSessionId: params.request.sessionId,
    expectedDeviceId: params.device.deviceId,
    expectedPermission: "private-session:create",
    expectedMethod: "POST",
    expectedResource: params.expectedResource,
    expectedBodyCommitment: bodyCommitment,
    expectedAudience: params.expectedAudience,
    sessionExpiresAt: params.request.expiresAt,
    deviceStatus: params.device.status,
    now,
    consumeNonce: () => true,
  });
  if (!verification.valid) throw new Error(`Private session rejected: ${verification.reason}`);
  if (
    !await params.consumeNonce({
      nonce: params.proof.nonce,
      deviceId: params.device.deviceId,
      sessionId: params.request.sessionId,
      purpose: "private-session:create",
      expiresAt: params.proof.expiresAt,
    })
  ) {
    throw new Error("Private session proof nonce has already been consumed");
  }
  return { permissions };
}

export async function verifyTsnAuthorizedPrivateRequest(params: {
  sessionToken: string;
  proof: SignedSessionProof;
  permission: string;
  method: string;
  resource: string;
  bodyCommitment: string;
  expectedAudience: string;
  findSessionByToken: (
    token: string,
  ) => Promise<TsnPrivateSessionVerificationRecord | null>;
  findDevice: (
    deviceId: string,
  ) => Promise<TsnAuthorizedDeviceVerificationRecord | null>;
  consumeNonce: (params: {
    nonce: string;
    deviceId: string;
    sessionId: string;
    purpose: string;
    expiresAt: string;
  }) => Promise<boolean>;
}): Promise<{
  session: TsnPrivateSessionVerificationRecord;
  device: TsnAuthorizedDeviceVerificationRecord;
}> {
  const session = await params.findSessionByToken(params.sessionToken);
  if (!session || session.status !== "active") {
    throw new Error("Private session is invalid or expired");
  }
  if (session.audience !== params.expectedAudience) throw new Error("Private session audience mismatch");
  if (!session.permissions.includes(params.permission)) throw new Error("Private session permission denied");
  const device = await params.findDevice(session.deviceId);
  if (!device) throw new Error("Authorized device was not found");
  if (!device.permissions.includes(params.permission)) {
    throw new Error("Authorized device permission denied");
  }
  if (device.tinCommitment !== session.tinCommitment) {
    throw new Error("Private session TIN binding mismatch");
  }
  if (params.proof.deviceSigningKeyFingerprint !== device.signingKeyFingerprint) {
    throw new Error("Private request uses an unregistered signing key");
  }

  const verification = await verifySessionProof({
    proof: params.proof,
    deviceSigningPublicKey: device.signingPublicKey,
    expectedSessionId: session.sessionId,
    expectedDeviceId: device.deviceId,
    expectedPermission: params.permission,
    expectedMethod: params.method,
    expectedResource: params.resource,
    expectedBodyCommitment: params.bodyCommitment,
    expectedAudience: params.expectedAudience,
    sessionExpiresAt: session.expiresAt,
    deviceStatus: device.status,
    consumeNonce: () => true,
  });
  if (!verification.valid) throw new Error(`Private request rejected: ${verification.reason}`);
  if (
    !await params.consumeNonce({
      nonce: params.proof.nonce,
      deviceId: device.deviceId,
      sessionId: session.sessionId,
      purpose: params.permission,
      expiresAt: params.proof.expiresAt,
    })
  ) {
    throw new Error("Private request nonce has already been consumed");
  }
  return { session, device };
}
