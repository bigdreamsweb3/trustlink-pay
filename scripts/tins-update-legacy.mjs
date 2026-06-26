import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import nacl from "tweetnacl";
import { Keypair, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  DEFAULT_TINS_PROGRAM_ID,
  createOwnerIntentSignatureInstruction,
  createTinOwnerIntentHash,
  serializeTinUpdateParams,
} from "../tsn-sdk/dist/tins.js";
import {
  DEFAULT_PRU_COUNT,
  DEFAULT_PRU_PRIVACY_LEVEL,
  computePruConfigurationHash,
  derivePruSet,
  generateTinMasterSeed,
} from "../tsn-sdk/dist/pru.js";
import { createSolanaConnection, resolveSolanaRpcUrl } from "./lib/tsn-rpc.mjs";
import { findLegacyTinAccount } from "./lib/tins-legacy-account.mjs";

const ZERO_HASH_32 = Buffer.alloc(32);

function usage() {
  console.error("Usage: npm run tins:update:legacy -- <TIN> [--owner <keypair.json>] [--save-seed <path>] [--display-name \"Name\"]");
}

function expandHome(value) {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { positionals, flags };
}

function loadKeypair(filePath) {
  const resolvedPath = expandHome(filePath);
  const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function writeSeedBackup(targetPath, payload) {
  const resolvedPath = path.resolve(expandHome(targetPath));
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(payload, null, 2));
  return resolvedPath;
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const tin = positionals[0];
  if (!tin) {
    usage();
    process.exit(1);
  }

  const programId = new PublicKey(process.env.TINS_PROGRAM_ID ?? DEFAULT_TINS_PROGRAM_ID);
  const rpcUrl = resolveSolanaRpcUrl({ frontendSafe: false });
  const connection = createSolanaConnection();
  const ownerKeypairPath = String(flags.owner ?? process.env.TINS_OWNER_KEYPAIR ?? "~/.config/solana/id.json");
  const ownerKeypair = loadKeypair(ownerKeypairPath);

  console.log(`Upgrading legacy TIN ${tin} on ${rpcUrl}`);
  console.log(`Using TINS program ${programId.toBase58()}`);
  console.log(`Using owner keypair ${expandHome(ownerKeypairPath)}`);

  const legacy = await findLegacyTinAccount({ connection, programId, tin });
  if (!legacy) {
    throw new Error(`Legacy TIN ${tin} was not found in ${programId.toBase58()}`);
  }
  if (!legacy.decoded.ownerPubkey) {
    throw new Error("Legacy TIN does not expose an owner pubkey. This account cannot be safely upgraded with the current tool.");
  }
  if (!legacy.decoded.ownerPubkey.equals(ownerKeypair.publicKey)) {
    throw new Error(
      `Owner mismatch. TIN owner is ${legacy.decoded.ownerPubkey.toBase58()} but supplied keypair is ${ownerKeypair.publicKey.toBase58()}.`,
    );
  }
  if (legacy.decoded.privacyLevel === DEFAULT_PRU_PRIVACY_LEVEL && legacy.decoded.pruConfigurationHash) {
    throw new Error("This TIN already has PRU configuration data. It is not a legacy-upgrade target.");
  }

  const masterSeed = generateTinMasterSeed();
  const pruSet = derivePruSet({
    masterSeed,
    tinId: String(legacy.decoded.tin),
    privacyLevel: DEFAULT_PRU_PRIVACY_LEVEL,
  });
  const pruConfigurationHash = Buffer.from(computePruConfigurationHash(pruSet), "hex");
  const encryptedMetadataHash = ZERO_HASH_32;
  const expiryTs = BigInt(Math.floor(Date.now() / 1000) + 900);
  const nonce = ZERO_HASH_32;
  const displayName = String(flags["display-name"] ?? legacy.decoded.displayName);

  const intentHash = createTinOwnerIntentHash({
    purpose: "update",
    ownerPubkey: ownerKeypair.publicKey,
    displayName,
    encryptedPhone: legacy.decoded.encryptedPhone,
    privacyLevel: DEFAULT_PRU_PRIVACY_LEVEL,
    encryptedMetadataHash,
    pruConfigurationHash,
    nonce,
    expiryTs,
  });

  const ownerSignature = nacl.sign.detached(intentHash, ownerKeypair.secretKey);
  const signatureInstruction = createOwnerIntentSignatureInstruction({
    ownerPubkey: ownerKeypair.publicKey,
    intentHash,
    signature: ownerSignature,
  });

  const updateInstruction = new Transaction().add(
    signatureInstruction,
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: ownerKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: legacy.pubkey, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: serializeTinUpdateParams({
        ownerPubkey: ownerKeypair.publicKey,
        displayName,
        encryptedPhone: legacy.decoded.encryptedPhone,
        privacyLevel: DEFAULT_PRU_PRIVACY_LEVEL,
        encryptedMetadataHash,
        pruConfigurationHash,
        intentHash,
        expiryTs,
      }),
    }),
  );

  const signature = await sendAndConfirmTransaction(connection, updateInstruction, [ownerKeypair], {
    commitment: "confirmed",
  });

  console.log("");
  console.log("Legacy TIN upgrade submitted.");
  console.log(`TIN:                 ${legacy.decoded.tin.toString()}`);
  console.log(`Identity PDA:        ${legacy.pubkey.toBase58()}`);
  console.log(`Owner:               ${ownerKeypair.publicKey.toBase58()}`);
  console.log(`Privacy level:       ${DEFAULT_PRU_PRIVACY_LEVEL}`);
  console.log(`PRU count:           ${DEFAULT_PRU_COUNT}`);
  console.log(`PRU config hash:     ${pruConfigurationHash.toString("hex")}`);
  console.log(`Transaction:         ${signature}`);
  console.log("");
  console.log("TIN master seed backup");
  console.log(`Seed (hex):          ${Buffer.from(masterSeed).toString("hex")}`);

  const saveSeedPath = flags["save-seed"] ?? process.env.TINS_MASTER_SEED_OUT;
  if (saveSeedPath) {
    const savedTo = writeSeedBackup(saveSeedPath, {
      tin: legacy.decoded.tin.toString(),
      owner: ownerKeypair.publicKey.toBase58(),
      generatedAt: new Date().toISOString(),
      pruCount: DEFAULT_PRU_COUNT,
      privacyLevel: DEFAULT_PRU_PRIVACY_LEVEL,
      pruConfigurationHash: pruConfigurationHash.toString("hex"),
      tinMasterSeedHex: Buffer.from(masterSeed).toString("hex"),
    });
    console.log(`Seed backup file:    ${savedTo}`);
  } else {
    console.log("Seed backup file:    not written");
    console.log("Warning: store the seed hex securely before using PRU spend flows.");
  }

  console.log("");
  console.log(`Next check: npm run tins:lookup ${legacy.decoded.tin.toString()}`);
}

main().catch((error) => {
  console.error("Legacy TIN upgrade failed.");
  console.error(error);
  process.exitCode = 1;
});
