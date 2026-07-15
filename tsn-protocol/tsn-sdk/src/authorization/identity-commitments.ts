import { PublicKey } from "@solana/web3.js";
import { canonicalFields, sha256Hex } from "../receipts/internal/encoding.js";

export async function createTinCommitment(tin: string): Promise<string> {
  return sha256Hex(canonicalFields(["TSN_TIN_COMMITMENT_V1", tin]));
}

export async function createOwnerIdentityCommitment(ownerPublicKey: string): Promise<string> {
  return sha256Hex(new PublicKey(ownerPublicKey).toBytes());
}

export async function createAuthorizationCommitment(serializedAuthorization: Uint8Array): Promise<string> {
  return sha256Hex(canonicalFields([
    "TSN_DEVICE_AUTHORIZATION_COMMITMENT_V1",
    Buffer.from(serializedAuthorization).toString("base64url"),
  ]));
}
