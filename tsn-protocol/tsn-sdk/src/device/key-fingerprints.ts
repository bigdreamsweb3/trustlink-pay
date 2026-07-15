import { canonicalFields, sha256Hex } from "../receipts/internal/encoding.js";

export async function fingerprintDeviceSigningPublicKey(publicKey: JsonWebKey): Promise<string> {
  return sha256Hex(canonicalFields([
    "TSN_DEVICE_SIGNING_KEY_V1",
    publicKey.kty ?? "",
    publicKey.crv ?? "",
    publicKey.x ?? "",
  ]));
}

export async function fingerprintEncryptionPublicKey(
  publicKey: JsonWebKey,
  purpose: "device" | "recovery",
): Promise<string> {
  return sha256Hex(canonicalFields([
    "TSN_OWNER_CONTROLLED_ENCRYPTION_KEY_V1",
    purpose,
    publicKey.kty ?? "",
    publicKey.crv ?? "",
    publicKey.x ?? "",
  ]));
}
