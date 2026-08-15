import type {
  TinMasterSeedAccessContext,
  TinMasterSeedThresholdProvider,
} from "./tin-private-controller.js";
import type { TinDeviceKeyEnvelope } from "./tin-device-key-envelope.js";
import { wrapTinThresholdKeyForDevice } from "./tin-device-key-envelope.js";
import type { TinDeviceAccessProof } from "./tin-device-access.js";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalFields,
  sha256Hex,
} from "./receipts/internal/encoding.js";

/**
 * Authorized-device envelope adapter used by the TSN-native TIN envelope flow.
 *
 * The provider never receives a master seed. It generates a random data key,
 * wraps that key to the current device's non-exportable X25519 key, and stores
 * only the resulting opaque envelope in the TIN. Release is local and fails
 * closed when the envelope is addressed to another device.
 *
 * This adapter never copies a private key between devices and never uses a
 * server-held decryption secret. Cross-device re-wrapping is a separate
 * owner-authorized migration operation, not a decryption operation.
 */
export const TSN_DEVICE_ENVELOPE_PROVIDER_ID = "tsn-device-envelope-v1" as const;
const PROTECTED_KEY_VERSION = "tsn-device-envelope-protected-key-v1" as const;

type ProtectedKeyRecord = {
  version: typeof PROTECTED_KEY_VERSION;
  envelope: TinDeviceKeyEnvelope;
};

function encodeProtectedKey(envelope: TinDeviceKeyEnvelope) {
  const record: ProtectedKeyRecord = {
    version: PROTECTED_KEY_VERSION,
    envelope,
  };
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(record)));
}

function decodeProtectedKey(value: string): TinDeviceKeyEnvelope {
  let parsed: Partial<ProtectedKeyRecord>;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as Partial<ProtectedKeyRecord>;
  } catch {
    throw new Error("TIN device envelope is invalid");
  }
  if (parsed.version !== PROTECTED_KEY_VERSION || !parsed.envelope) {
    throw new Error("TIN device envelope version is unsupported");
  }
  return parsed.envelope;
}

function accessControlFields(params: {
  context: TinMasterSeedAccessContext;
  proof: TinDeviceAccessProof;
}) {
  return canonicalFields([
    "TSN_DEVICE_ENVELOPE_ACCESS_V1",
    params.context.tin,
    params.context.ownerPublicKey,
    String(params.context.routeVersion),
    params.context.pruConfigurationHash.toLowerCase(),
    params.context.resourceCommitment.toLowerCase(),
    params.proof.deviceId,
    params.proof.deviceSigningKeyFingerprint,
    params.proof.deviceEncryptionKeyFingerprint,
  ]);
}

async function protectedKeyCommitment(protectedKey: string) {
  return sha256Hex(canonicalFields([
    "TSN_DEVICE_ENVELOPE_PROTECTED_KEY_V1",
    protectedKey,
  ]));
}

export class TsnDeviceEnvelopeTinMasterSeedProvider
  implements TinMasterSeedThresholdProvider {
  readonly id = TSN_DEVICE_ENVELOPE_PROVIDER_ID;

  constructor(private readonly sessionBinding: string) {
    if (!sessionBinding.trim()) throw new Error("TIN device session binding is required");
  }

  async getDeviceSessionBinding() {
    return this.sessionBinding;
  }

  async protectKey(context: TinMasterSeedAccessContext) {
    const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
    try {
      const deviceKeyEnvelope = await wrapTinThresholdKeyForDevice({
        keyMaterial,
        proof: context.deviceAccessProof,
        aadMode: "device-envelope",
      });
      const protectedKey = encodeProtectedKey(deviceKeyEnvelope);
      return {
        protectedKey,
        protectedKeyCommitment: await protectedKeyCommitment(protectedKey),
        accessControlHash: await sha256Hex(accessControlFields({
          context,
          proof: context.deviceAccessProof,
        })),
        deviceKeyEnvelope,
      };
    } finally {
      keyMaterial.fill(0);
    }
  }

  async releaseKey(context: TinMasterSeedAccessContext & {
    protectedKey: string;
    protectedKeyCommitment: string;
    accessControlHash: string;
  }) {
    const envelope = decodeProtectedKey(context.protectedKey);
    if (
      envelope.recipientKeyFingerprint !==
      context.deviceAccessProof.deviceEncryptionKeyFingerprint
    ) {
      throw new Error(
        "TIN envelope belongs to another device; authorize this device and upgrade the TIN before loading its private balance",
      );
    }
    const expectedProtectedCommitment = await protectedKeyCommitment(context.protectedKey);
    if (expectedProtectedCommitment !== context.protectedKeyCommitment.toLowerCase()) {
      throw new Error("TIN device envelope commitment does not match");
    }
    const expectedAccessControlHash = await sha256Hex(accessControlFields({
      context,
      proof: context.deviceAccessProof,
    }));
    if (expectedAccessControlHash !== context.accessControlHash.toLowerCase()) {
      throw new Error("TIN device envelope access context does not match");
    }
    return envelope;
  }
}
