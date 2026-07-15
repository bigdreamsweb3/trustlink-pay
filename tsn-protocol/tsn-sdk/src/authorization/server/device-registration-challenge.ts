import { randomBytes } from "node:crypto";

import {
  TSN_DEVICE_REGISTRATION_CHALLENGE_VERSION,
  type DeviceRegistrationChallenge,
} from "../device-registration-challenge.js";

export function createDeviceRegistrationChallenge(params: {
  tinCommitment: string;
  network: string;
  audience: string;
  now?: Date;
  ttlMs?: number;
}): DeviceRegistrationChallenge {
  const now = params.now ?? new Date();
  const ttlMs = params.ttlMs ?? 5 * 60 * 1_000;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > 10 * 60 * 1_000) {
    throw new Error(
      "Device registration challenge TTL must be between one millisecond and ten minutes",
    );
  }
  return {
    protocolVersion: TSN_DEVICE_REGISTRATION_CHALLENGE_VERSION,
    nonce: randomBytes(32).toString("base64url"),
    tinCommitment: params.tinCommitment,
    network: params.network,
    audience: params.audience,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
}
