import type { TinDeviceAccessProof } from "./tin-device-access.js";
import type { TinDeviceKeyEnvelope } from "./tin-device-key-envelope.js";
import type { TinMasterSeedAccessContext } from "./tin-private-controller.js";
import { bytesToBase64Url } from "./receipts/internal/encoding.js";
import type { TinThresholdNonceReceipt } from "./tin-threshold-nonce-receipt.js";

export const LIT_TIN_ACTION_REQUEST_DOMAIN = "TSN_TIN_THRESHOLD_KEY_ACTION" as const;

type PublicAccessContext = Omit<
  TinMasterSeedAccessContext,
  "walletAuthorizationMessage" | "walletAuthorizationSignature" | "deviceAccessProof"
>;

export type LitTinProtectKeyRequest = {
  domain: typeof LIT_TIN_ACTION_REQUEST_DOMAIN;
  operation: "PROTECT_KEY";
  pkpId: string;
  access: PublicAccessContext;
  walletAuthorizationMessageBase64Url: string;
  walletAuthorizationSignatureBase64Url: string;
  deviceAccessProof: TinDeviceAccessProof;
};

export type LitTinReleaseKeyRequest = {
  domain: typeof LIT_TIN_ACTION_REQUEST_DOMAIN;
  operation: "RELEASE_KEY";
  pkpId: string;
  access: PublicAccessContext;
  walletAuthorizationMessageBase64Url: string;
  walletAuthorizationSignatureBase64Url: string;
  deviceAccessProof: TinDeviceAccessProof;
  protectedKey: string;
  protectedKeyCommitment: string;
  accessControlHash: string;
};

export type LitTinActionRequest =
  | LitTinProtectKeyRequest
  | LitTinReleaseKeyRequest;

export type LitTinProtectKeyResponse = {
  operation: "PROTECT_KEY";
  protectedKey: string;
  protectedKeyCommitment: string;
  accessControlHash: string;
  deviceKeyEnvelope: TinDeviceKeyEnvelope;
  nonceReceipt: TinThresholdNonceReceipt;
};

export type LitTinReleaseKeyResponse = {
  operation: "RELEASE_KEY";
  deviceKeyEnvelope: TinDeviceKeyEnvelope;
  nonceReceipt: TinThresholdNonceReceipt;
};

const FORBIDDEN_SERIALIZED_KEYS = new Set([
  "masterseed",
  "seedciphertext",
  "keymaterial",
  "privatekey",
  "secretkey",
  "mnemonic",
  "apikey",
  "usageapikey",
]);

function assertNoSecretFields(value: unknown, path = "request") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[^a-z]/gi, "").toLowerCase();
    if (FORBIDDEN_SERIALIZED_KEYS.has(normalized)) {
      throw new Error(`TIN action request contains forbidden field ${path}.${key}`);
    }
    assertNoSecretFields(child, `${path}.${key}`);
  }
}

function publicAccess(params: TinMasterSeedAccessContext): PublicAccessContext {
  return {
    tin: params.tin,
    ownerPublicKey: params.ownerPublicKey,
    routeVersion: params.routeVersion,
    pruConfigurationHash: params.pruConfigurationHash,
    deviceSessionBinding: params.deviceSessionBinding,
    resourceCommitment: params.resourceCommitment,
  };
}

function authorization(params: TinMasterSeedAccessContext) {
  return {
    walletAuthorizationMessageBase64Url: bytesToBase64Url(
      params.walletAuthorizationMessage,
    ),
    walletAuthorizationSignatureBase64Url: bytesToBase64Url(
      params.walletAuthorizationSignature,
    ),
    deviceAccessProof: params.deviceAccessProof,
  };
}

export function createLitTinProtectKeyRequest(params: {
  pkpId: string;
  access: TinMasterSeedAccessContext;
}): LitTinProtectKeyRequest {
  const request: LitTinProtectKeyRequest = {
    domain: LIT_TIN_ACTION_REQUEST_DOMAIN,
    operation: "PROTECT_KEY",
    pkpId: params.pkpId,
    access: publicAccess(params.access),
    ...authorization(params.access),
  };
  assertNoSecretFields(request);
  return request;
}

export function createLitTinReleaseKeyRequest(params: {
  pkpId: string;
  access: TinMasterSeedAccessContext;
  protectedKey: string;
  protectedKeyCommitment: string;
  accessControlHash: string;
}): LitTinReleaseKeyRequest {
  const request: LitTinReleaseKeyRequest = {
    domain: LIT_TIN_ACTION_REQUEST_DOMAIN,
    operation: "RELEASE_KEY",
    pkpId: params.pkpId,
    access: publicAccess(params.access),
    ...authorization(params.access),
    protectedKey: params.protectedKey,
    protectedKeyCommitment: params.protectedKeyCommitment,
    accessControlHash: params.accessControlHash,
  };
  assertNoSecretFields(request);
  return request;
}

export function assertSafeLitTinActionRequest(value: unknown): asserts value is LitTinActionRequest {
  assertNoSecretFields(value);
  const request = value as Partial<LitTinActionRequest> | null;
  if (
    !request ||
    request.domain !== LIT_TIN_ACTION_REQUEST_DOMAIN ||
    (request.operation !== "PROTECT_KEY" && request.operation !== "RELEASE_KEY")
  ) {
    throw new Error("TIN action request domain or operation is invalid");
  }
}
