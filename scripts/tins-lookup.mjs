import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  decodeTinsIdentityRegistry,
  resolveTIN,
} from "../tsn-protocol/tsn-sdk/dist/tins.js";
import { resolveSolanaRpcUrl } from "./lib/tsn-rpc.mjs";

const DEFAULT_TINS_PROGRAM_ID = new PublicKey(
  "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT",
);

function resolveRpcUrl() {
  return resolveSolanaRpcUrl({ frontendSafe: false });
}

function toHex(value) {
  return Buffer.from(value).toString("hex");
}

function toBase64(value) {
  return Buffer.from(value).toString("base64");
}

function printValue(label, value, padding = 28) {
  console.log(`${label.padEnd(padding)} ${value}`);
}

function safeJson(value) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function tryDecodeModernRegistry(data) {
  try {
    const decoded = decodeTinsIdentityRegistry(data);
    if (decoded.version > 0 && decoded.name.trim().length > 0) {
      return decoded;
    }
  } catch {
    // fall through to legacy layout
  }
  return null;
}

function decodeLegacyTinAccount(data) {
  const buffer = Buffer.from(data);
  let offset = 0;

  const tin = buffer.readBigUInt64LE(offset);
  offset += 8;

  const displayNameLength = buffer.readUInt32LE(offset);
  offset += 4;
  const displayName = buffer.subarray(offset, offset + displayNameLength).toString("utf8");
  offset += displayNameLength;

  const identityPubkey = new PublicKey(buffer.subarray(offset, offset + 32));
  offset += 32;

  let encryptedPhone = Buffer.alloc(0);
  if (offset + 4 <= buffer.length) {
    const encryptedPhoneLength = buffer.readUInt32LE(offset);
    offset += 4;
    encryptedPhone = buffer.subarray(offset, Math.min(offset + encryptedPhoneLength, buffer.length));
    offset += encryptedPhone.length;
  }

  let createdAt = null;
  if (offset + 8 <= buffer.length) {
    createdAt = buffer.readBigInt64LE(offset);
    offset += 8;
  }

  let privacyLevel = null;
  if (offset + 1 <= buffer.length) {
    privacyLevel = buffer.readUInt8(offset);
    offset += 1;
  }

  let encryptedMetadataHash = null;
  if (offset + 32 <= buffer.length) {
    encryptedMetadataHash = buffer.subarray(offset, offset + 32);
    offset += 32;
  }

  let pruConfigurationHash = null;
  if (offset + 32 <= buffer.length) {
    pruConfigurationHash = buffer.subarray(offset, offset + 32);
  }

  return {
    kind: "legacy",
    tin,
    displayName,
    identityPubkey,
    encryptedPhone,
    createdAt,
    privacyLevel,
    encryptedMetadataHash,
    pruConfigurationHash,
  };
}

function printRawDump(data) {
  console.log("\n=== Raw Account Data ===");
  printValue("Length:", `${data.length} bytes`);
  printValue("Base64:", toBase64(data));
  printValue("Hex:", toHex(data));
}

function printModernRegistry(decoded, resolved, data) {
  console.log("\n=== On-Chain TIN Registry ===");
  printValue("Layout:", "current identity registry");
  printValue("TIN Number:", decoded.tin.toString());
  printValue("Registry Name:", decoded.name || resolved.name);
  printValue("Authority:", decoded.authority.toBase58());
  printValue("Master Privacy:", decoded.masterPrivacy.toBase58());
  printValue("Last Escrow ID:", decoded.lastEscrowId.toString());
  printValue("Status:", String(decoded.status));
  printValue("Created At:", `${decoded.createdAt.toString()} (unix timestamp)`);
  printValue("Registry PDA:", resolved.registry.toBase58());

  console.log("\n=== Public / Decrypted Social Identities ===");
  if (resolved.socialIdentities.length === 0) {
    console.log("None stored in this account.");
  } else {
    resolved.socialIdentities.forEach((identity, index) => {
      const raw = decoded.socialIdentities[index];
      console.log(`\n[${index}] ${identity.type}${identity.label ? ` · ${identity.label}` : ""}`);
      printValue("Decrypted Value:", identity.value);
      printValue("Metadata:", safeJson(raw?.metadata ?? "{}"));
      printValue("Verified By:", identity.verifiedBy ?? "unverified");
      printValue("Linked At:", identity.linkedAt);
      if (raw) {
        printValue("Nonce (hex):", toHex(raw.nonce));
        printValue("Ciphertext (hex):", toHex(raw.ciphertext));
        printValue("Proof Hash (hex):", toHex(raw.proofHash));
      }
    });
  }

  console.log("\n=== Encrypted Sensitive Fields ===");
  if (decoded.sensitiveFields.length === 0) {
    console.log("None stored in this account.");
  } else {
    decoded.sensitiveFields.forEach((field, index) => {
      console.log(`\n[${index}] ${field.fieldType}`);
      printValue("Decryption:", "requires explicit user authorization");
      printValue("Metadata:", safeJson(field.metadata));
      printValue("Linked At:", field.linkedAt.toString());
      printValue("Nonce (hex):", toHex(field.nonce));
      printValue("Ciphertext (hex):", toHex(field.ciphertext));
      printValue("Proof Hash (hex):", toHex(field.proofHash));
    });
  }

  printRawDump(data);
}

function printLegacyAccount(decoded, resolved, data) {
  console.log("\n=== On-Chain TIN Account ===");
  printValue("Layout:", "legacy tin account");
  printValue("TIN Number:", decoded.tin.toString());
  printValue("Display Name:", decoded.displayName);
  printValue("Identity PDA:", decoded.identityPubkey.toBase58());
  printValue("Owner Pubkey:", "legacy / unavailable");
  printValue("Created At:", decoded.createdAt ? `${decoded.createdAt.toString()} (unix timestamp)` : "unknown");
  printValue("Privacy Level:", decoded.privacyLevel ?? "legacy / unavailable");
  printValue("Encrypted Metadata Hash:", decoded.encryptedMetadataHash ? toHex(decoded.encryptedMetadataHash) : "legacy / unavailable");
  printValue("PRU Config Hash:", decoded.pruConfigurationHash ? toHex(decoded.pruConfigurationHash) : "legacy / unavailable");

  console.log("\n=== Encrypted Payloads ===");
  printValue("Encrypted Phone:", decoded.encryptedPhone.length > 0 ? `${decoded.encryptedPhone.length} bytes` : "unavailable");
  if (decoded.encryptedPhone.length > 0) {
    printValue("Encrypted Phone (base64):", toBase64(decoded.encryptedPhone));
    printValue("Encrypted Phone (hex):", toHex(decoded.encryptedPhone));
  }

  console.log("\n=== Resolution Summary ===");
  printValue("Resolved Name:", resolved.name);
  printValue("Authority:", resolved.authority.toBase58());
  printValue("Account Kind:", resolved.accountKind);
  printValue("Settlement Verified:", String(resolved.settlementAuthorityVerified));

  printRawDump(data);
}

async function main() {
  const args = process.argv.slice(2);
  const targetTinArg = args.find((value) => !value.startsWith("-"));
  if (!targetTinArg) {
    console.error("Usage: node tins-lookup.mjs <TIN> [--raw]");
    process.exit(1);
  }

  let targetTin;
  try {
    targetTin = BigInt(targetTinArg);
  } catch {
    console.error("Invalid TIN. Must be a number.");
    process.exit(1);
  }

  const rpcUrl = resolveRpcUrl();
  const connection = new Connection(rpcUrl, "confirmed");
  console.log(`Searching for TIN: ${targetTin.toString()} on ${rpcUrl}...`);

  const tinBuffer = Buffer.alloc(8);
  tinBuffer.writeBigUInt64LE(targetTin, 0);

  const accounts = await connection.getProgramAccounts(DEFAULT_TINS_PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(tinBuffer),
        },
      },
    ],
  });

  if (accounts.length === 0) {
    console.log(`No TINS account found for TIN ${targetTin.toString()}`);
    return;
  }

  console.log(`Found ${accounts.length} account(s) for TIN ${targetTin.toString()}`);

  for (const account of accounts) {
    console.log(`\nAccount Pubkey (PDA): ${account.pubkey.toBase58()}`);
    const data = account.account.data;
    const modern = tryDecodeModernRegistry(data);
    const resolved = await resolveTIN({
      tin: targetTin,
      connection,
      programId: DEFAULT_TINS_PROGRAM_ID,
    }).catch(() => null);

    if (modern) {
      const modernResolved = resolved ?? {
        tin: modern.tin.toString(),
        name: modern.name,
        authority: modern.authority,
        registry: account.pubkey,
        accountKind: "registry",
        settlementAuthorityVerified: false,
        status: modern.status,
        createdAt: modern.createdAt.toString(),
        socialIdentities: [],
        sensitiveFields: [],
        encryptedSensitiveFields: modern.sensitiveFields,
      };
      printModernRegistry(modern, modernResolved, data);
    } else {
      const legacy = decodeLegacyTinAccount(data);
      const legacyResolved = resolved ?? {
        tin: legacy.tin.toString(),
        name: legacy.displayName,
        authority: legacy.identityPubkey,
        registry: account.pubkey,
        accountKind: "legacy",
        settlementAuthorityVerified: false,
        status: 1,
        createdAt: legacy.createdAt?.toString() ?? "unknown",
        socialIdentities: [],
        sensitiveFields: [],
        encryptedSensitiveFields: [],
      };
      printLegacyAccount(legacy, legacyResolved, data);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exitCode = 1;
});
