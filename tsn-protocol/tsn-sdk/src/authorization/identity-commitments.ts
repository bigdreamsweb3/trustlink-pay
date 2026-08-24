import { PublicKey } from "@solana/web3.js";
import { bytesToBase64Url, bytesToHex, canonicalFields, sha256Hex } from "../receipts/internal/encoding.js";

export const TSN_PRIVACY_RECEIVING_ROOT_COMMITMENT_DOMAIN = "TSN_PRIVACY_RECEIVING_ROOT_COMMITMENT_V1";
export const TSN_DEVNET_TEST_PRIVACY_ROOT_MATERIAL_DOMAIN = "TSN_DEVNET_TEST_PRIVACY_ROOT_MATERIAL_V1";
export const TSN_DEVNET_TEST_POLICY_COMMITMENT_DOMAIN = "TSN_DEVNET_TEST_POLICY_COMMITMENT_V1";
export const TSN_DEVNET_TEST_TCAP_GENESIS_COMMITMENT_DOMAIN = "TSN_DEVNET_TEST_TCAP_GENESIS_COMMITMENT_V1";

export async function createTinCommitment(tin: string): Promise<string> {
  return sha256Hex(canonicalFields(["TSN_TIN_COMMITMENT_V1", tin]));
}

export async function createOwnerIdentityCommitment(ownerPublicKey: string): Promise<string> {
  return sha256Hex(new PublicKey(ownerPublicKey).toBytes());
}

export async function createAuthorizationCommitment(serializedAuthorization: Uint8Array): Promise<string> {
  return sha256Hex(canonicalFields([
    "TSN_DEVICE_AUTHORIZATION_COMMITMENT_V1",
    bytesToBase64Url(serializedAuthorization),
  ]));
}

/**
 * Commits owner-device privacy-receiving-root material without exposing the
 * material itself. Production callers must supply root material held by the
 * authorized device; this function does not derive a spend key or balance.
 */
export async function derivePrivacyReceivingRootCommitment(rootMaterial: Uint8Array | string): Promise<string> {
  const materialHex = typeof rootMaterial === "string" ? rootMaterial.toLowerCase() : bytesToHex(rootMaterial);
  if (!/^[0-9a-f]{64,}$/.test(materialHex) || materialHex.length % 2 !== 0) {
    throw new Error("privacy_receiving_root_material_must_be_nonempty_hex");
  }
  return sha256Hex(canonicalFields([TSN_PRIVACY_RECEIVING_ROOT_COMMITMENT_DOMAIN, materialHex]));
}

/**
 * Controlled Devnet identity only. This deterministic fixture is intentionally
 * labelled and must not be described as production wallet recovery. It lets
 * the Devnet lab reproduce one owner-device root from a public wallet key and
 * an explicit test identity label without using random bytes.
 */
export async function deriveDevnetTestPrivacyReceivingRootCommitment(
  ownerPublicKey: string,
  identityLabel = "fixture-wallet-v1",
): Promise<string> {
  const material = await sha256Hex(canonicalFields([
    TSN_DEVNET_TEST_PRIVACY_ROOT_MATERIAL_DOMAIN,
    ownerPublicKey,
    identityLabel,
  ]));
  return derivePrivacyReceivingRootCommitment(material);
}

/** Controlled Devnet-only policy binding for the named test identity. */
export async function deriveDevnetTestPolicyCommitment(
  ownerPublicKey: string,
  identityLabel = "fixture-wallet-v1",
): Promise<string> {
  return sha256Hex(canonicalFields([
    TSN_DEVNET_TEST_POLICY_COMMITMENT_DOMAIN,
    ownerPublicKey,
    identityLabel,
  ]));
}

/** Controlled Devnet-only nonzero genesis commitment for a new TCap tip. */
export async function deriveDevnetTestTcapGenesisCommitment(
  ownerPublicKey: string,
  policyCommitment: string,
  identityLabel = "fixture-wallet-v1",
): Promise<string> {
  return sha256Hex(canonicalFields([
    TSN_DEVNET_TEST_TCAP_GENESIS_COMMITMENT_DOMAIN,
    ownerPublicKey,
    identityLabel,
    policyCommitment,
  ]));
}
