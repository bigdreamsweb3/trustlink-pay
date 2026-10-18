import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_LOOKUP_KEY = "6e52464f8b6f7726c331bfd3a17e116bdc5b6859f76e0fa046041300bc829ed7";
const TINS_PROGRAM_ID = new PublicKey("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");

function parseArgs(args) {
  let tin;
  let rpcUrl = DEFAULT_RPC_URL;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--rpc") {
      rpcUrl = args[++i];
      if (!rpcUrl) throw new Error("--rpc requires a URL");
    } else if (arg.startsWith("--rpc=")) {
      rpcUrl = arg.slice("--rpc=".length);
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/tin-lookup.mjs <TIN> [--rpc <URL>]");
      return null;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (tin === undefined) {
      tin = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return { tin, rpcUrl };
}

function decodeRegistry(data) {
  const bytes = Buffer.from(data);
  let offset = 0;
  const take = (length, field) => {
    if (!Number.isSafeInteger(length) || length < 0 || offset + length > bytes.length) {
      throw new Error(`TIN registry data is truncated at ${field}`);
    }
    const value = bytes.subarray(offset, offset + length);
    offset += length;
    return value;
  };
  const u8 = (field) => take(1, field)[0];
  const u32 = (field) => take(4, field).readUInt32LE(0);
  const u64 = (field) => take(8, field).readBigUInt64LE(0);
  const i64 = (field) => take(8, field).readBigInt64LE(0);
  const vec = (field) => take(u32(`${field} length`), field);
  const account = {
    version: u8("version"),
    bump: u8("bump"),
    status: u8("status"),
    reserved: take(5, "reserved"),
    lookupCommitment: take(32, "lookup commitment"),
    ownerCommitment: take(32, "owner commitment"),
    encryptedIdentityEnvelope: vec("identity envelope"),
    encryptedMasterSeedEnvelope: vec("master-seed envelope"),
    createdAt: i64("created-at"),
    encryptedMetadataHash: take(32, "metadata hash"),
    routeVersion: u64("route version"),
    routeNonce: take(32, "route nonce"),
    tipRouteVersion: u8("TIP route version"),
    gpruElgamalKeyVersion: u8("GPRU ElGamal key version"),
    gpruElgamalPublicKey: take(32, "GPRU ElGamal public key"),
    gpruElgamalKeyCommitment: take(32, "GPRU ElGamal key commitment"),
    policyCommitment: take(32, "policy commitment"),
  };
  account.trailingAllocation = take(bytes.length - offset, "allocation padding");
  return account;
}

function displayRegistryBytes(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex");
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(displayRegistryBytes);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, displayRegistryBytes(entry)]),
    );
  }
  return value;
}

function decryptIdentity(envelope, tin, lookupKey) {
  if (envelope.length < 28) throw new Error("TIN identity envelope is malformed");
  const key = createHash("sha256").update(Buffer.concat([
    Buffer.from("TSN_TIN_V1_IDENTITY", "utf8"),
    Buffer.from(lookupKey, "utf8"),
    Buffer.from(tin, "utf8"),
  ])).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, envelope.subarray(0, 12));
  decipher.setAuthTag(envelope.subarray(-16));
  return JSON.parse(Buffer.concat([
    decipher.update(envelope.subarray(12, -16)),
    decipher.final(),
  ]).toString("utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) return;
  if (!args.tin || !/^\d+$/.test(args.tin)) throw new Error("Pass a numeric TIN");
  const lookupKey = process.env.TINS_LOOKUP_KEY || process.env.TINS_LOOKUP_SECRET || DEFAULT_LOOKUP_KEY;
  const lookupCommitment = createHash("sha256").update(Buffer.concat([
    Buffer.from("TSN_TIN_V1_LOOKUP", "utf8"),
    Buffer.from(lookupKey, "utf8"),
    Buffer.from(args.tin, "utf8"),
  ])).digest();
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tin-v1", "utf8"), lookupCommitment],
    TINS_PROGRAM_ID,
  );

  const response = await fetch(args.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "getAccountInfo",
      params: [registryPda.toBase58(), { encoding: "base64", commitment: "confirmed" }],
    }),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(responseText);
  const rpc = JSON.parse(responseText);
  if (rpc.error) throw new Error(JSON.stringify(rpc.error));
  const value = rpc.result?.value;
  if (!value) throw new Error(`No registry account found for TIN ${args.tin}`);
  if (value.owner !== TINS_PROGRAM_ID.toBase58()) throw new Error(`Unexpected account owner: ${value.owner}`);

  const account = decodeRegistry(Buffer.from(value.data[0], "base64"));
  if (account.version !== 1) {
    throw new Error(`Unsupported TIN registry schema version ${account.version}; expected 1`);
  }
  const expectedGpruElgamalKeyCommitment = createHash("sha256").update(Buffer.concat([
    Buffer.from("TSN_GPRU_ELGAMAL_KEY_COMMITMENT_V1\0", "utf8"),
    Buffer.from([account.gpruElgamalKeyVersion]),
    account.gpruElgamalPublicKey,
  ])).digest();
  if (!expectedGpruElgamalKeyCommitment.equals(account.gpruElgamalKeyCommitment)) {
    throw new Error("GPRU ElGamal public key does not match the registry commitment");
  }
  const identity = decryptIdentity(account.encryptedIdentityEnvelope, args.tin, lookupKey);
  const masterSeedEnvelope = JSON.parse(account.encryptedMasterSeedEnvelope.toString("utf8"));
  const inspectOptions = {
    depth: null,
    colors: false,
    maxArrayLength: null,
    maxStringLength: null,
  };
  console.dir(displayRegistryBytes(account), inspectOptions);
  console.dir(identity, inspectOptions);
  console.dir(masterSeedEnvelope, inspectOptions);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
