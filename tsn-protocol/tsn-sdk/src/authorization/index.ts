export {
  TSN_DEVICE_AUTHORIZATION_DOMAIN,
  TSN_DEVICE_AUTHORIZATION_VERSION,
  canonicalizeDeviceAuthorizationClaims,
  serializeDeviceAuthorization,
} from "./device-authorization.js";
export type {
  DeviceAuthorizationClaims,
  HistoryRecoveryScope,
} from "./device-authorization.js";
export {
  TSN_DEVICE_PERMISSION_SCOPES,
  validateTsnDevicePermissions,
} from "./device-permissions.js";
export type { TsnDevicePermission } from "./device-permissions.js";
export {
  createAuthorizationCommitment,
  createOwnerIdentityCommitment,
  createTinCommitment,
} from "./identity-commitments.js";

export {
  authorizeDevice,
  getDeviceAuthorizationState,
  verifyOwnerAuthorization,
} from "./device-authorization-client.js";
export type {
  DeviceAuthorizationState,
  TsnOwnerMessageSigner,
} from "./device-authorization-client.js";
export { TSN_DEVICE_REGISTRATION_CHALLENGE_VERSION } from "./device-registration-challenge.js";
export type { DeviceRegistrationChallenge } from "./device-registration-challenge.js";
