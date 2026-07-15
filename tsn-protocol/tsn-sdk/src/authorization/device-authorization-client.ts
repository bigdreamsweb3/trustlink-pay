import {
  TSN_DEVICE_AUTHORIZATION_DOMAIN,
  TSN_DEVICE_AUTHORIZATION_VERSION,
  serializeDeviceAuthorization,
  type DeviceAuthorizationClaims,
  type HistoryRecoveryScope,
} from "./device-authorization.js";
import {
  TSN_DEVICE_REGISTRATION_CHALLENGE_VERSION,
  type DeviceRegistrationChallenge,
} from "./device-registration-challenge.js";
import {
  createOwnerIdentityCommitment,
  createTinCommitment,
} from "./identity-commitments.js";
import { validateTsnDevicePermissions } from "./device-permissions.js";
import {
  fingerprintDeviceSigningPublicKey,
  fingerprintEncryptionPublicKey,
} from "../device/key-fingerprints.js";

export interface DeviceAuthorizationState {
  ownerVerified: true;
  deviceAuthorized: true;
}

export interface TsnOwnerMessageSigner {
  publicKey: string;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

function serviceUrl(baseUrl: string, resource: string) {
  return `${baseUrl.replace(/\/+$/, "")}${resource}`;
}

async function readJson(response: Response) {
  const body = await response.json();
  if (!response.ok) {
    const message = typeof body?.error === "string"
      ? body.error
      : "TSN device authorization request failed";
    throw new Error(message);
  }
  return body;
}

export function verifyOwnerAuthorization(value: unknown): DeviceAuthorizationState {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as Record<string, unknown>).ownerVerified !== true ||
    (value as Record<string, unknown>).deviceAuthorized !== true
  ) {
    throw new Error("TSN authorization service did not confirm owner and device authorization");
  }
  return { ownerVerified: true, deviceAuthorized: true };
}

export function getDeviceAuthorizationState(
  value: DeviceAuthorizationState,
): DeviceAuthorizationState {
  return verifyOwnerAuthorization(value);
}

export async function authorizeDevice(params: {
  authorizationServiceUrl: string;
  tin: string;
  deviceId: string;
  signingPublicKey: JsonWebKey;
  encryptionPublicKey: JsonWebKey;
  permissions: string[];
  historyRecoveryScope: HistoryRecoveryScope;
  selectedReceiptIds?: string[];
  wallet: TsnOwnerMessageSigner;
  fetch?: typeof fetch;
}): Promise<DeviceAuthorizationState> {
  const request = params.fetch ?? fetch;
  const challenge = await readJson(await request(
    serviceUrl(params.authorizationServiceUrl, "/api/tsn/privacy/devices/challenge"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tin: params.tin }),
    },
  )) as DeviceRegistrationChallenge;
  if (challenge.protocolVersion !== TSN_DEVICE_REGISTRATION_CHALLENGE_VERSION) {
    throw new Error("TSN authorization service returned an unsupported challenge");
  }
  const tinCommitment = await createTinCommitment(params.tin);
  if (challenge.tinCommitment !== tinCommitment) {
    throw new Error("TSN registration challenge is bound to another TIN");
  }

  const signerPublicKey = params.wallet.publicKey;
  const authorization: DeviceAuthorizationClaims = {
    protocolVersion: TSN_DEVICE_AUTHORIZATION_VERSION,
    domain: TSN_DEVICE_AUTHORIZATION_DOMAIN,
    network: challenge.network,
    tinCommitment,
    ownerIdentityCommitment: await createOwnerIdentityCommitment(signerPublicKey),
    deviceSigningKeyFingerprint: await fingerprintDeviceSigningPublicKey(
      params.signingPublicKey,
    ),
    deviceEncryptionKeyFingerprint: await fingerprintEncryptionPublicKey(
      params.encryptionPublicKey,
      "device",
    ),
    permissions: validateTsnDevicePermissions(params.permissions),
    historyRecoveryScope: params.historyRecoveryScope,
    ...(params.historyRecoveryScope === "selected"
      ? { selectedReceiptIds: params.selectedReceiptIds ?? [] }
      : {}),
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
    audience: challenge.audience,
  };
  const signature = await params.wallet.signMessage(
    serializeDeviceAuthorization(authorization),
  );
  const result = await readJson(await request(
    serviceUrl(params.authorizationServiceUrl, "/api/tsn/privacy/devices/register"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tin: params.tin,
        deviceId: params.deviceId,
        signingPublicKey: params.signingPublicKey,
        encryptionPublicKey: params.encryptionPublicKey,
        authorization,
        ownerVerification: {
          signerPublicKey,
          signatureBase64: Buffer.from(signature).toString("base64"),
        },
      }),
    },
  ));
  return verifyOwnerAuthorization(result);
}
