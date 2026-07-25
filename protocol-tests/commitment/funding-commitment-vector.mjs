import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bs58 from "bs58";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function hex(value) {
  return Buffer.from(value, "hex");
}

function u16(value) {
  const output = Buffer.alloc(2);
  output.writeUInt16LE(Number(value));
  return output;
}

function u32(value) {
  const output = Buffer.alloc(4);
  output.writeUInt32LE(Number(value));
  return output;
}

function u64(value) {
  const output = Buffer.alloc(8);
  output.writeBigUInt64LE(BigInt(value));
  return output;
}

function sha256(parts) {
  return createHash("sha256").update(Buffer.concat(parts)).digest();
}

export async function loadFundingCommitmentVector() {
  const contents = await fs.readFile(path.join(root, "test-vectors", "tcap-funding-commitment.json"), "utf8");
  return JSON.parse(contents);
}

export function computeV1FundingCommitment(vector) {
  const program = Buffer.from(bs58.decode(vector.programId));
  const authorization = sha256([
    Buffer.from("tcap:funding-auth:v1", "utf8"),
    program,
    u16(vector.protocolVersion),
    hex(vector.depositorHex),
    hex(vector.fundingIdentifierHex),
    u64(vector.authorizationNonce),
    u64(vector.expirySlot),
  ]);
  const preimage = Buffer.concat([
    Buffer.from("TCAP_FUNDING_CLAIM_V1", "utf8"),
    program,
    u16(vector.protocolVersion),
    hex(vector.registryHex),
    hex(vector.reserveHex),
    Buffer.from(bs58.decode(vector.tokenProgram)),
    hex(vector.mintHex),
    u32(vector.registryVersion),
    hex(vector.assetCommitmentHex),
    u64(vector.amountBaseUnits),
    Buffer.from([vector.settlementMode]),
    hex(vector.destinationCommitmentHex),
    authorization,
    hex(vector.fundingIdentifierHex),
    u64(vector.authorizationNonce),
    u64(vector.expirySlot),
    hex(vector.feeAuthorizationCommitmentHex),
    hex(vector.saltHex),
    hex(vector.domainSeparatorHex),
  ]);
  return {
    authorizationCommitmentHex: authorization.toString("hex"),
    preimageHex: preimage.toString("hex"),
    preimageLength: preimage.length,
    commitmentHex: sha256([preimage]).toString("hex"),
  };
}
