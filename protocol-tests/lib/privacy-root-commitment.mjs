import { createHash } from "node:crypto";

export const TSN_PRIVACY_RECEIVING_ROOT_COMMITMENT_DOMAIN = "TSN_PRIVACY_RECEIVING_ROOT_COMMITMENT_V1";
export const TSN_DEVNET_TEST_PRIVACY_ROOT_MATERIAL_DOMAIN = "TSN_DEVNET_TEST_PRIVACY_ROOT_MATERIAL_V1";
export const TSN_DEVNET_TEST_POLICY_COMMITMENT_DOMAIN = "TSN_DEVNET_TEST_POLICY_COMMITMENT_V1";
export const TSN_DEVNET_TEST_TCAP_GENESIS_COMMITMENT_DOMAIN = "TSN_DEVNET_TEST_TCAP_GENESIS_COMMITMENT_V1";

const canonical = (fields) => Buffer.from(fields.map((field) => `${field.length}:${field}`).join("|"));
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function deriveDevnetTestPrivacyReceivingRootCommitment(ownerPublicKey, identityLabel = "fixture-wallet-v1") {
  const material = sha256Hex(canonical([
    TSN_DEVNET_TEST_PRIVACY_ROOT_MATERIAL_DOMAIN,
    ownerPublicKey,
    identityLabel,
  ]));
  return sha256Hex(canonical([
    TSN_PRIVACY_RECEIVING_ROOT_COMMITMENT_DOMAIN,
    material,
  ]));
}

export function deriveDevnetTestPolicyCommitment(ownerPublicKey, identityLabel = "fixture-wallet-v1") {
  return sha256Hex(canonical([
    TSN_DEVNET_TEST_POLICY_COMMITMENT_DOMAIN,
    ownerPublicKey,
    identityLabel,
  ]));
}

export function deriveDevnetTestTcapGenesisCommitment(ownerPublicKey, policyCommitment, identityLabel = "fixture-wallet-v1") {
  return sha256Hex(canonical([
    TSN_DEVNET_TEST_TCAP_GENESIS_COMMITMENT_DOMAIN,
    ownerPublicKey,
    identityLabel,
    policyCommitment,
  ]));
}
