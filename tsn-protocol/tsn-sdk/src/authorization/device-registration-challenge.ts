export const TSN_DEVICE_REGISTRATION_CHALLENGE_VERSION =
  "tsn-device-registration-challenge-v1";

export interface DeviceRegistrationChallenge {
  protocolVersion: typeof TSN_DEVICE_REGISTRATION_CHALLENGE_VERSION;
  nonce: string;
  tinCommitment: string;
  network: string;
  audience: string;
  issuedAt: string;
  expiresAt: string;
}
