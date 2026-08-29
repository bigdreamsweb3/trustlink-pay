#!/usr/bin/env node

/**
 * Prepare the canonical TCAP V2 asset infrastructure on Solana Devnet.
 *
 * This command initializes only the asset-state, reserve-state, reserve
 * authority PDA, and governed token vault consumed by deposit_asset_v2. The
 * on-chain entrypoint is named initialize_asset_state_v1 because the account
 * layouts are versioned V1; this is infrastructure setup, not a V1 payment,
 * intent, receipt, epoch, or nullifier flow.
 *
 * The default mode is a read-only plan. Pass --confirm to submit the one
 * initialization transaction. Existing or partially-created accounts are
 * never overwritten; malformed/partial state fails closed.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TCAP_PROGRAM_ID = new PublicKey("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");
const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const EXPECTED_TCAP_PROGRAM_ID = TCAP_PROGRAM_ID.toBase58();
const DEFAULT_RPC = "https://api.devnet.solana.com";
const SEEDS = Object.freeze({
  config: "tcap:global-config:v1",
  assetState: "tcap:asset-state:v1",
  reserveState: "tcap:reserve-state:v1",
  reserveAuthority: "tcap:reserve-authority:v1",
  futureVault: "tcap:future-vault:v1",
});

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

// Shell/Vercel values win; the checked-in defaults only fill unset values.
loadEnvFile(path.join(REPO_ROOT, ".env"));
loadEnvFile(path.join(REPO_ROOT, ".env.local"));
loadEnvFile(path.join(REPO_ROOT, "protocol-tests", "tcap-credit-devnet.defaults.env"));

function configured(name) {
  const value = process.env[name]?.trim();
  if (!value || /^(?:<[^>]+>|\.{2,}|your[_-]?.*|replace[_-]?.*|change[_-]?me|todo|not[_-]?set|undefined|null|none)$/i.test(value)) return undefined;
  return value;
}

function fail(message) {
  throw new Error(`[tcap-asset-state-v2-init] ${message}`);
}

function publicKey(value, label) {
  try { return new PublicKey(value); } catch { fail(`${label} is not a valid Solana public key`); }
}

function discriminator(kind, name) {
  return createHash("sha256").update(`${kind}:${name}`).digest().subarray(0, 8);
}

function pda(...parts) {
  return PublicKey.findProgramAddressSync(
    parts.map((part) => Buffer.isBuffer(part) ? part : Buffer.from(part)),
    TCAP_PROGRAM_ID,
  )[0];
}

function rpcUrl() {
  let anchorRpc;
  for (const file of [
    path.join(REPO_ROOT, "tcap-protocol", "Anchor.toml"),
    path.join(REPO_ROOT, "tsn-protocol", "tsn", "protocol", "Anchor.toml"),
  ]) {
    try {
      anchorRpc = fs.readFileSync(file, "utf8").match(/^cluster\s*=\s*"([^"]+)"/m)?.[1];
    } catch { /* try the next file */ }
    if (anchorRpc) break;
  }
  const value = configured("TCAP_RPC_URL")
    ?? configured("HELIUS_DEVNET_RPC_URL")
    ?? configured("HELIUS_RPC_URL")
    ?? configured("ANCHOR_PROVIDER_URL")
    ?? configured("SOLANA_RPC_URL")
    ?? anchorRpc
    ?? DEFAULT_RPC;
  if (!/^https?:\/\//i.test(value) || !/devnet/i.test(value)) {
    fail("RPC must be a Solana Devnet URL; set TCAP_RPC_URL to a Helius/provider endpoint");
  }
  return value;
}

function walletPath() {
  const value = configured("TCAP_ASSET_STATE_PAYER_WALLET")
    ?? configured("TSN_MOTHER_AUTHORITY_WALLET")
    ?? configured("TCAP_GOVERNANCE_WALLET")
    ?? configured("TCAP_GOVERNANCE_KEYPAIR")
    ?? configured("SOLANA_WALLET")
    ?? configured("ANCHOR_WALLET")
    ?? "~/.config/solana/id.json";
  const expanded = value.replace(/^~(?=$|[\\/])/, os.homedir());
  return path.isAbsolute(expanded) ? expanded : path.resolve(REPO_ROOT, expanded);
}

function loadWallet() {
  const file = walletPath();
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail(`cannot read payer keypair at ${file}`); }
  if (!Array.isArray(raw) || raw.length !== 64) fail(`payer keypair at ${file} must be a 64-byte Solana keypair JSON array`);
  try { return Keypair.fromSecretKey(Uint8Array.from(raw)); } catch { fail(`payer keypair at ${file} is invalid`); }
}

function accountData(info) {
  if (!info) return null;
  return Buffer.isBuffer(info.data) ? info.data : Buffer.from(info.data[0], "base64");
}

function requireProgramAccount(info, address, label) {
  if (!info) return false;
  if (!info.owner.equals(TCAP_PROGRAM_ID)) fail(`${label} ${address.toBase58()} is owned by ${info.owner.toBase58()}, not TCAP ${EXPECTED_TCAP_PROGRAM_ID}`);
  return true;
}

function assertPublicKey(data, offset, expected, label) {
  const actual = new PublicKey(data.subarray(offset, offset + 32));
  if (!actual.equals(expected)) fail(`${label} does not bind the canonical ${expected.toBase58()}`);
}

function validateAssetState(info, addresses, mint, tokenProgram) {
  const data = accountData(info);
  if (!data || data.length < 206 || !data.subarray(0, 8).equals(discriminator("account", "TcapAssetStateV1"))) {
    fail(`asset state ${addresses.assetState.toBase58()} has an unexpected account layout`);
  }
  assertPublicKey(data, 12, addresses.config, "asset state config");
  assertPublicKey(data, 44, tokenProgram, "asset state token program");
  assertPublicKey(data, 76, mint, "asset state mint");
  assertPublicKey(data, 108, addresses.reserveState, "asset state reserve");
  assertPublicKey(data, 140, addresses.vault, "asset state vault");
  assertPublicKey(data, 172, addresses.reserveAuthority, "asset state reserve authority");
}

function validateReserveState(info, addresses) {
  const data = accountData(info);
  if (!data || data.length < 193 || !data.subarray(0, 8).equals(discriminator("account", "TcapReserveStateV1"))) {
    fail(`reserve state ${addresses.reserveState.toBase58()} has an unexpected account layout`);
  }
  assertPublicKey(data, 12, addresses.assetState, "reserve asset state");
  // initialize_asset_state_v1 deliberately stores the asset-state PDA here;
  // this keeps deposit_asset_v2 independent from the legacy asset-entry PDA.
  assertPublicKey(data, 76, addresses.vault, "reserve vault");
  assertPublicKey(data, 108, addresses.reserveAuthority, "reserve authority");
}

function validateVault(info, addresses, mint, tokenProgram) {
  if (!info.owner.equals(tokenProgram)) fail(`governed vault ${addresses.vault.toBase58()} is not owned by the classic SPL Token program`);
  const data = accountData(info);
  if (!data || data.length < 64) fail(`governed vault ${addresses.vault.toBase58()} is not a readable token account`);
  assertPublicKey(data, 0, mint, "governed vault mint");
  assertPublicKey(data, 32, addresses.reserveAuthority, "governed vault authority");
}

function buildInitializeInstruction({ payer, config, mint, assetState, reserveState, reserveAuthority, vault, tokenProgram }) {
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: assetState, isSigner: false, isWritable: true },
      { pubkey: reserveState, isSigner: false, isWritable: true },
      { pubkey: reserveAuthority, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: discriminator("global", "initialize_asset_state_v1"),
  });
}

async function main() {
  if (TCAP_PROGRAM_ID.toBase58() !== EXPECTED_TCAP_PROGRAM_ID) fail("pinned TCAP program id is inconsistent");
  const connection = new Connection(rpcUrl(), "confirmed");
  const payer = loadWallet();
  const mint = publicKey(configured("TCAP_MINT"), "TCAP_MINT");
  const tokenProgram = publicKey(configured("TCAP_TOKEN_PROGRAM") ?? SPL_TOKEN_PROGRAM_ID.toBase58(), "TCAP_TOKEN_PROGRAM");
  if (!tokenProgram.equals(SPL_TOKEN_PROGRAM_ID)) fail("this initializer currently supports classic SPL Token only; Token-2022 is not enabled by the deployed TCAP instruction");

  const addresses = {
    config: pda(SEEDS.config),
    assetState: pda(SEEDS.assetState, tokenProgram.toBuffer(), mint.toBuffer()),
  };
  addresses.reserveState = pda(SEEDS.reserveState, addresses.assetState.toBuffer());
  addresses.reserveAuthority = pda(SEEDS.reserveAuthority, addresses.assetState.toBuffer());
  addresses.vault = pda(SEEDS.futureVault, addresses.assetState.toBuffer());

  const [configInfo, mintInfo, assetStateInfo, reserveStateInfo, vaultInfo] = await connection.getMultipleAccountsInfo([
    addresses.config, mint, addresses.assetState, addresses.reserveState, addresses.vault,
  ], "confirmed");
  if (!configInfo?.owner.equals(TCAP_PROGRAM_ID)) fail(`TCAP global config ${addresses.config.toBase58()} is missing or not owned by TCAP`);
  const configBytes = accountData(configInfo);
  if (!configBytes || configBytes.length < 208 || configBytes[207] !== 0) fail("TCAP global config is paused or has an unexpected layout");
  if (!mintInfo?.owner.equals(tokenProgram)) fail(`TCAP_MINT ${mint.toBase58()} is missing or is not owned by classic SPL Token`);

  const present = [
    requireProgramAccount(assetStateInfo, addresses.assetState, "asset state"),
    requireProgramAccount(reserveStateInfo, addresses.reserveState, "reserve state"),
    Boolean(vaultInfo),
  ];
  if (present.some(Boolean)) {
    if (!present.every(Boolean)) {
      const missing = [
        !assetStateInfo ? `asset state ${addresses.assetState.toBase58()}` : undefined,
        !reserveStateInfo ? `reserve state ${addresses.reserveState.toBase58()}` : undefined,
        !vaultInfo ? `vault ${addresses.vault.toBase58()}` : undefined,
      ].filter(Boolean).join(", ");
      fail(`canonical TCAP V2 infrastructure is partially initialized; missing ${missing}. Refusing to mutate existing state`);
    }
    validateAssetState(assetStateInfo, addresses, mint, tokenProgram);
    validateReserveState(reserveStateInfo, addresses);
    validateVault(vaultInfo, addresses, mint, tokenProgram);
    console.log(JSON.stringify({
      status: "ALREADY_INITIALIZED",
      network: "devnet",
      program: TCAP_PROGRAM_ID.toBase58(),
      mint: mint.toBase58(),
      addresses: Object.fromEntries(Object.entries(addresses).map(([key, value]) => [key, value.toBase58()])),
      payer: payer.publicKey.toBase58(),
      next: "Run npm run tcap:credit:v2:devnet",
    }, null, 2));
    return;
  }

  const initIx = buildInitializeInstruction({ payer: payer.publicKey, mint, tokenProgram, ...addresses });
  const plan = {
    status: "READY",
    network: "devnet",
    program: TCAP_PROGRAM_ID.toBase58(),
    instruction: "initialize_asset_state_v1 (canonical V2 infrastructure only)",
    payer: payer.publicKey.toBase58(),
    mint: mint.toBase58(),
    addresses: Object.fromEntries(Object.entries(addresses).map(([key, value]) => [key, value.toBase58()])),
    writes: ["asset state", "reserve state", "governed token vault"],
    doesNotCreate: ["payment intent", "epoch", "receipt", "nullifier", "TIN", "route", "ZK-PRU"],
    next: "Re-run with --confirm to submit this one initialization transaction",
  };
  if (!process.argv.includes("--confirm")) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(initIx), [payer], { commitment: "confirmed" });
  const [assetAfter, reserveAfter, vaultAfter] = await connection.getMultipleAccountsInfo([
    addresses.assetState, addresses.reserveState, addresses.vault,
  ], "confirmed");
  if (!assetAfter || !reserveAfter || !vaultAfter) fail(`initialization confirmed as ${signature}, but one or more canonical accounts are not readable yet`);
  if (!assetAfter.owner.equals(TCAP_PROGRAM_ID) || !reserveAfter.owner.equals(TCAP_PROGRAM_ID)) fail(`initialization ${signature} returned accounts with an unexpected owner`);
  validateAssetState(assetAfter, addresses, mint, tokenProgram);
  validateReserveState(reserveAfter, addresses);
  validateVault(vaultAfter, addresses, mint, tokenProgram);
  console.log(JSON.stringify({ ...plan, status: "INITIALIZED", signature }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "FAILED", scenario: "TCAP V2 asset infrastructure initialization", error: String(error?.message ?? error) }, null, 2));
  process.exitCode = 1;
});
