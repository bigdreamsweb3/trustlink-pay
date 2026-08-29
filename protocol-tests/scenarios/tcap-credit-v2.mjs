#!/usr/bin/env node

/**
 * Devnet-only V2 TCAP funding + GPRU tip-credit runner.
 *
 * This scenario intentionally has two transactions:
 *   Tx1: TCAP deposit_asset_v2 (liquidity funding)
 *   Tx2: TSN tsn_register_tcap_credit_authorization_v2, which CPI-calls
 *       TCAP credit_tcap_tin_tip_v2.
 *
 * It never calls a V1 instruction and never creates an intent, epoch,
 * receipt, nullifier, TIN, route, or ZK-PRU account. The credit transaction
 * is checked against an exact account allowlist after confirmation.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import bs58 from "bs58";
import { deriveDevnetTestPrivacyReceivingRootCommitment } from "../lib/privacy-root-commitment.mjs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TCAP_PROGRAM_ID,
  TSN_PROGRAM_ID,
  buildTsnRegisterTcapCreditAuthorizationV2Instruction,
  deriveGpruTcapCreditAuthorizationDigest,
} from "../../tcap-protocol/scripts/tcap-credit-transaction.mjs";

const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const EXPECTED_TCAP_PROGRAM_ID = "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x";
const EXPECTED_TSN_PROGRAM_ID = "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V";
const DEFAULT_TSN_MOTHER_ESCROW = "ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR";
const DEVNET_DEFAULT_RPC = "https://api.devnet.solana.com";
const SEEDS = Object.freeze({
  tcapConfig: "tcap:global-config:v1",
  tcapRegistry: "tcap:asset-registry:v1",
  tcapAssetEntry: "tcap:asset-entry:v1",
  tcapAssetState: "tcap:asset-state:v1",
  tcapReserveState: "tcap:reserve-state:v1",
  tcapFutureVault: "tcap:future-vault:v1",
  tcapTinTip: "tcap:tin-tip:v1",
  tcapAuth: "tsn:tcap-authorization:v1",
});
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const FORBIDDEN_ACCOUNT_NAMES = [
  "AcceptedIntentV1",
  "EpochCommitmentStateV1",
  "EpochTreasury",
  "EpochSettlementLedger",
  "TsnAuthorizationReceiptV1",
  "NullifierRecordV1",
  "TcapCommitmentRootStateV1",
  "TcapPaymentIntentV1",
  "TsnPaymentIntentV1",
  "PaymentIntentV1",
  "TinAccountV1",
  "TinRouteV1",
  "TinRouteStateV1",
  "PrivacyReceivingUnitV1",
  "ZkPruV1",
  "FundingRootV1",
  "FundingClaimV1",
  "FundingAuthorizationNonceV1",
];
const FORBIDDEN_INSTRUCTION_NAMES = [
  "tsn_accept_intent",
  "tsn_fund_epoch_treasury",
  "register_tsn_authorization_v1",
  "credit_tcap_tin_tip_v1",
  "tsn_register_tcap_credit_authorization",
];

function loadOptionalEnv(file) {
  if (typeof process.loadEnvFile !== "function") return;
  try { process.loadEnvFile(file); } catch { /* optional local configuration */ }
}

// Explicit shell/Vercel variables win. The checked-in Devnet record file is
// loaded last so it only fills unset values and never replaces an operator's
// configuration.
loadOptionalEnv(path.join(REPO_ROOT, ".env"));
loadOptionalEnv(path.join(REPO_ROOT, ".env.local"));
loadOptionalEnv(path.join(REPO_ROOT, "protocol-tests", "tcap-credit-devnet.defaults.env"));

function fail(message) {
  throw new Error(`[tcap-credit-v2] ${message}`);
}

function sanitizedError(error) {
  return String(error?.message ?? error).replace(/https?:\/\/[^\s"']+/gi, "<rpc-endpoint>");
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`missing required environment variable ${name}`);
  return value;
}

function configuredValue(name) {
  const value = process.env[name]?.trim();
  if (!value || /^(?:<[^>]+>|\.{2,}|your[_-]?.*|replace[_-]?.*|change[_-]?me|todo|not[_-]?set|undefined|null|none)$/i.test(value)) return undefined;
  return value;
}

function resolveTipRootCommitment(payerKey) {
  const explicitName = ["TCAP_TIP_ROOT_COMMITMENT", "TCAP_TIP_ROOT_HEX", "TCAP_TIP_ROOT"]
    .find((name) => configuredValue(name));
  const value = explicitName ? configuredValue(explicitName) : undefined;
  if (value) {
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) && !/^[0-9a-fA-F]{64}$/.test(value)) {
      fail(`${explicitName} received a Base58 address (${value}); it needs the original 32-byte tip-root commitment as 64 hexadecimal characters, not the TCAP commitment-root PDA`);
    }
    return hex32(value, explicitName);
  }
  const identityLabel = configuredValue("TCAP_DEVNET_TEST_IDENTITY_LABEL") ?? "fixture-wallet-v1";
  const derived = deriveDevnetTestPrivacyReceivingRootCommitment(payerKey.toBase58(), identityLabel);
  return hex32(derived, "derived TCAP_TIP_ROOT_COMMITMENT");
}

function publicKey(value, label) {
  try { return new PublicKey(value); } catch { fail(`${label} is not a valid Solana public key`); }
}

function hex32(value, label) {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) fail(`${label} must be exactly 64 hexadecimal characters`);
  return Buffer.from(value, "hex");
}

function bytes32(value, label) {
  if (value === undefined) return randomBytes(32);
  return hex32(value, label);
}

function u64(value, label) {
  let result;
  try { result = BigInt(value); } catch { fail(`${label} must be an unsigned integer`); }
  if (result < 0n || result > 0xffffffffffffffffn) fail(`${label} is outside the u64 range`);
  const output = Buffer.alloc(8);
  output.writeBigUInt64LE(result);
  return output;
}

function u32(value, label) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0 || result > 0xffffffff) fail(`${label} is outside the u32 range`);
  const output = Buffer.alloc(4);
  output.writeUInt32LE(result);
  return output;
}

function discriminator(kind, name) {
  return createHash("sha256").update(`${kind}:${name}`).digest().subarray(0, 8);
}

function pda(programId, ...seedParts) {
  return PublicKey.findProgramAddressSync(seedParts.map((part) => Buffer.isBuffer(part) ? part : Buffer.from(part)), programId)[0];
}

function associatedTokenAddress(owner, mint, tokenProgram) {
  return pda(ASSOCIATED_TOKEN_PROGRAM_ID, owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer());
}

function accountData(info) {
  if (!info) return null;
  return Buffer.isBuffer(info.data) ? info.data : Buffer.from(info.data[0], "base64");
}

function tokenAmount(info, label) {
  const data = accountData(info);
  if (!data || data.length < 72) fail(`${label} is not a readable SPL token account`);
  return data.readBigUInt64LE(64);
}

function tokenOwner(info, label) {
  const data = accountData(info);
  if (!data || data.length < 64) fail(`${label} is not a readable SPL token account`);
  return new PublicKey(data.subarray(32, 64));
}

function tokenMint(info, label) {
  const data = accountData(info);
  if (!data || data.length < 32) fail(`${label} is not a readable SPL token account`);
  return new PublicKey(data.subarray(0, 32));
}

function readTip(info, tip) {
  const data = accountData(info);
  const expected = discriminator("account", "TCapTinTipV1");
  if (!data || data.length < 115 || !data.subarray(0, 8).equals(expected)) {
    fail(`tip ${tip.toBase58()} is not an initialized TCapTinTipV1 account`);
  }
  return {
    previousCommitment: data.subarray(10, 42),
    sequence: data.readBigUInt64LE(42),
    policyCommitment: data.subarray(50, 82),
    lastTransitionNullifier: data.subarray(82, 114),
    frozen: data[114] !== 0,
  };
}

function readAssetEntry(info, assetEntry) {
  const data = accountData(info);
  const expected = discriminator("account", "TcapAssetEntryV1");
  if (!data || data.length < 287 || !data.subarray(0, 8).equals(expected)) {
    fail(`asset entry ${assetEntry.toBase58()} is not an initialized TcapAssetEntryV1 account`);
  }
  return {
    tokenId: data.readUInt32LE(44),
    tokenProgram: new PublicKey(data.subarray(48, 80)),
    mint: new PublicKey(data.subarray(80, 112)),
    reserveState: new PublicKey(data.subarray(148, 180)),
    vault: new PublicKey(data.subarray(180, 212)),
    reserveAuthority: new PublicKey(data.subarray(212, 244)),
    paused: data[247] !== 0,
    status: data[283],
    riskState: data[284],
    deprecated: data[285] !== 0,
  };
}

function readAssetState(info, assetState, reserveState, vault, mint, tokenProgram) {
  const data = accountData(info);
  if (!data || data.length < 206 || !data.subarray(0, 8).equals(discriminator("account", "TcapAssetStateV1"))) {
    fail(`asset state ${assetState.toBase58()} is not an initialized TcapAssetStateV1 account`);
  }
  const storedTokenProgram = new PublicKey(data.subarray(44, 76));
  const storedMint = new PublicKey(data.subarray(76, 108));
  const storedReserve = new PublicKey(data.subarray(108, 140));
  const storedVault = new PublicKey(data.subarray(140, 172));
  if (!storedTokenProgram.equals(tokenProgram) || !storedMint.equals(mint) || !storedReserve.equals(reserveState) || !storedVault.equals(vault)) {
    fail("TCAP asset state does not bind the requested token, reserve, and governed vault");
  }
}

function readReserveState(info, reserveState, assetState, vault) {
  const data = accountData(info);
  if (!data || data.length < 193 || !data.subarray(0, 8).equals(discriminator("account", "TcapReserveStateV1"))) {
    fail(`reserve state ${reserveState.toBase58()} is not an initialized TcapReserveStateV1 account`);
  }
  const storedAssetState = new PublicKey(data.subarray(12, 44));
  const storedVault = new PublicKey(data.subarray(76, 108));
  if (!storedAssetState.equals(assetState) || !storedVault.equals(vault)) fail("TCAP reserve state does not bind the asset state and governed vault");
}

function readMotherAuthority(info, motherEscrow) {
  const data = accountData(info);
  if (!data || data.length < 40 || !data.subarray(0, 8).equals(discriminator("account", "MotherEscrow"))) {
    fail(`mother escrow ${motherEscrow.toBase58()} is not the current TSN MotherEscrow account`);
  }
  return new PublicKey(data.subarray(8, 40));
}

function readConfig(info, config) {
  const data = accountData(info);
  if (!data || data.length < 240 || !data.subarray(0, 8).equals(discriminator("account", "TcapGlobalConfigV1"))) {
    fail(`TCAP global config ${config.toBase58()} is not an initialized TcapGlobalConfigV1 account`);
  }
  return {
    approvedTsnProgram: new PublicKey(data.subarray(142, 174)),
    commitmentRoot: new PublicKey(data.subarray(208, 240)),
    paused: data[207] !== 0,
  };
}

function rpcUrl() {
  const configuredAnchorRpc = [
    path.join(REPO_ROOT, "tcap-protocol", "Anchor.toml"),
    path.join(REPO_ROOT, "tsn-protocol", "tsn", "protocol", "Anchor.toml"),
  ].map((file) => {
    try { return fs.readFileSync(file, "utf8").match(/^cluster\s*=\s*"([^"]+)"/m)?.[1]; } catch { return undefined; }
  }).find(Boolean);
  const value = (process.env.TCAP_RPC_URL
    ?? process.env.HELIUS_DEVNET_RPC_URL
    ?? process.env.HELIUS_RPC_URL
    ?? process.env.ANCHOR_PROVIDER_URL
    ?? process.env.SOLANA_RPC_URL
    ?? configuredAnchorRpc
    ?? DEVNET_DEFAULT_RPC).trim();
  if (!/^https?:\/\//i.test(value) || !/devnet/i.test(value)) fail("TCAP_RPC_URL, HELIUS_DEVNET_RPC_URL, HELIUS_RPC_URL, ANCHOR_PROVIDER_URL, SOLANA_RPC_URL, or Anchor.toml must point to Solana Devnet");
  return value;
}

function walletPath() {
  const value = (configuredValue("TCAP_FUNDING_WALLET")
    ?? configuredValue("TRUSTLINK_TEST_WALLET_KEYPAIR")
    ?? configuredValue("TCAP_TEST_WALLET")
    ?? "protocol-tests/tcap-devnet-test-wallet.json").trim();
  const expanded = value.replace(/^~(?=$|[\\/])/, os.homedir());
  return path.isAbsolute(expanded) ? expanded : path.resolve(REPO_ROOT, expanded);
}

function motherAuthorityWalletPath() {
  const value = (configuredValue("TSN_MOTHER_AUTHORITY_WALLET")
    ?? configuredValue("TSN_MOTHER_AUTHORITY_KEYPAIR")
    ?? configuredValue("SOLANA_WALLET")
    ?? configuredValue("ANCHOR_WALLET")
    ?? "~/.config/solana/id.json").trim();
  const expanded = value.replace(/^~(?=$|[\\/])/, os.homedir());
  return path.isAbsolute(expanded) ? expanded : path.resolve(REPO_ROOT, expanded);
}

function loadWallet(file, label) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail(`cannot read ${label} wallet at ${file}`); }
  if (!Array.isArray(raw) || raw.length !== 64) fail(`${label} wallet at ${file} must contain a 64-byte Solana keypair JSON array`);
  try { return Keypair.fromSecretKey(Uint8Array.from(raw)); } catch { fail(`${label} wallet at ${file} is not a valid Solana keypair`); }
}

function instructionData(ix) {
  if (!ix?.data) return null;
  if (Buffer.isBuffer(ix.data) || ix.data instanceof Uint8Array) return Buffer.from(ix.data);
  try { return Buffer.from(bs58.decode(ix.data)); } catch { return null; }
}

function allTransactionKeys(tx) {
  const message = tx?.transaction?.message;
  if (!message) return [];
  const staticKeys = message.staticAccountKeys ?? message.accountKeys ?? [];
  const loaded = tx.meta?.loadedAddresses ?? { writable: [], readonly: [] };
  return [...staticKeys, ...(loaded.writable ?? []), ...(loaded.readonly ?? [])].map((key) => key.toBase58());
}

function instructionRecords(tx) {
  const message = tx.transaction.message;
  const records = [];
  const topLevel = message.compiledInstructions ?? message.instructions ?? [];
  for (const ix of topLevel) records.push({ scope: "outer", ix });
  for (const group of tx.meta?.innerInstructions ?? []) {
    for (const ix of group.instructions ?? []) records.push({ scope: `inner:${group.index}`, ix });
  }
  return records;
}

function unique(values) { return [...new Set(values)]; }

async function confirmedTransaction(connection, signature) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail(`transaction ${signature} was confirmed but its metadata was not available from the RPC`);
}

function buildDepositAssetV2Instruction({ payer, config, assetState, assetEntry, reserveState, source, vault, mint, tokenProgram, amount }) {
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: assetState, isSigner: false, isWritable: true },
      { pubkey: assetEntry, isSigner: false, isWritable: false },
      { pubkey: reserveState, isSigner: false, isWritable: true },
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator("global", "deposit_asset_v2"), u64(amount, "TCAP_DEPOSIT_AMOUNT")]),
  });
}

function forbiddenInstructionHits(tx) {
  const names = new Map();
  for (const name of [...FORBIDDEN_INSTRUCTION_NAMES, "tsn_register_tcap_credit_authorization_v2", "credit_tcap_tin_tip_v2"]) {
    names.set(discriminator("global", name).toString("hex"), name);
  }
  return instructionRecords(tx).flatMap(({ scope, ix }) => {
    const data = instructionData(ix);
    const name = data ? names.get(data.subarray(0, 8).toString("hex")) : undefined;
    return name && FORBIDDEN_INSTRUCTION_NAMES.includes(name) ? [{ scope, name }] : [];
  });
}

async function inspectCreditTransaction(connection, signature, expected) {
  const tx = await confirmedTransaction(connection, signature);
  const accountKeys = unique(allTransactionKeys(tx));
  const infos = await connection.getMultipleAccountsInfo(accountKeys.map((key) => new PublicKey(key)), "confirmed");
  const fundingAccountsInCredit = accountKeys.filter((key) => expected.fundingAccounts.has(key));
  if (fundingAccountsInCredit.length) fail(`funding bookkeeping accounts appeared in the credit transaction: ${fundingAccountsInCredit.join(", ")}`);
  const allowed = new Set(expected.allowedAccounts.map((key) => key.toBase58()));
  const unexpectedAccounts = accountKeys.filter((key) => !allowed.has(key));
  if (unexpectedAccounts.length) fail(`credit transaction contains accounts outside its V2 allowlist: ${unexpectedAccounts.join(", ")}`);
  const forbiddenAddresses = accountKeys.filter((key) => expected.forbiddenAddresses?.has(key));
  if (forbiddenAddresses.length) fail(`credit transaction contains forbidden legacy PDA addresses: ${forbiddenAddresses.join(", ")}`);

  const records = instructionRecords(tx);
  const v2Names = new Map([
    [discriminator("global", "tsn_register_tcap_credit_authorization_v2").toString("hex"), "tsn_register_tcap_credit_authorization_v2"],
    [discriminator("global", "credit_tcap_tin_tip_v2").toString("hex"), "credit_tcap_tin_tip_v2"],
  ]);
  const v2Instructions = records.flatMap(({ scope, ix }) => {
    const data = instructionData(ix);
    const name = data ? v2Names.get(data.subarray(0, 8).toString("hex")) : undefined;
    return name ? [{ scope, name }] : [];
  });
  const forbiddenInstructions = forbiddenInstructionHits(tx);
  if (forbiddenInstructions.length) fail(`credit transaction contains forbidden V1 instructions: ${JSON.stringify(forbiddenInstructions)}`);
  const wrapperInstructions = v2Instructions.filter(({ name }) => name === "tsn_register_tcap_credit_authorization_v2");
  const cpiInstructions = v2Instructions.filter(({ name }) => name === "credit_tcap_tin_tip_v2");
  if (wrapperInstructions.length !== 1) fail(`credit transaction must contain exactly one TSN V2 wrapper (found ${wrapperInstructions.length})`);
  if (cpiInstructions.length !== 1) fail(`credit transaction must contain exactly one TCAP V2 CPI (found ${cpiInstructions.length})`);
  if (instructionRecords(tx).filter(({ scope }) => scope === "outer").length !== 1) fail("credit transaction must contain only the TSN V2 wrapper as its outer instruction");

  const forbiddenDiscriminators = new Map(FORBIDDEN_ACCOUNT_NAMES.map((name) => [discriminator("account", name).toString("hex"), name]));
  const forbiddenAccounts = [];
  for (let i = 0; i < accountKeys.length; i += 1) {
    const info = infos[i];
    const data = accountData(info);
    if (!data || data.length < 8) continue;
    const name = forbiddenDiscriminators.get(data.subarray(0, 8).toString("hex"));
    if (name) forbiddenAccounts.push({ address: accountKeys[i], name });
  }
  if (forbiddenAccounts.length) fail(`credit transaction loaded forbidden V1 account data: ${JSON.stringify(forbiddenAccounts)}`);
  const tipIndex = accountKeys.indexOf(expected.tip.toBase58());
  const tipInfo = tipIndex === -1 ? null : infos[tipIndex];
  const tipAfter = readTip(tipInfo, expected.tip);
  if (tipAfter.sequence !== expected.sequence || !tipAfter.previousCommitment.equals(expected.newCommitment)) {
    fail(`credit transaction did not advance the expected tip sequence/commitment (sequence=${tipAfter.sequence.toString()})`);
  }
  return {
    signature,
    slot: tx.slot,
    accountKeys,
    v2Instructions,
    forbiddenAccounts,
    forbiddenInstructions,
    fundingAccountsInCredit,
    tipAfter: { sequence: tipAfter.sequence.toString(), currentCommitment: tipAfter.previousCommitment.toString("hex") },
  };
}

async function main() {
  if (TCAP_PROGRAM_ID.toBase58() !== EXPECTED_TCAP_PROGRAM_ID || TSN_PROGRAM_ID.toBase58() !== EXPECTED_TSN_PROGRAM_ID) {
    fail(`program id mismatch; this runner is pinned to Devnet TCAP ${EXPECTED_TCAP_PROGRAM_ID} and TSN ${EXPECTED_TSN_PROGRAM_ID}`);
  }
  const connection = new Connection(rpcUrl(), "confirmed");
  const payer = loadWallet(walletPath(), "TCAP funding");
  const motherPayer = loadWallet(motherAuthorityWalletPath(), "TSN Mother authority");
  const payerKey = payer.publicKey;
  const motherKey = motherPayer.publicKey;
  const mint = publicKey(required("TCAP_MINT"), "TCAP_MINT");
  const tokenProgram = publicKey(process.env.TCAP_TOKEN_PROGRAM ?? SPL_TOKEN_PROGRAM_ID.toBase58(), "TCAP_TOKEN_PROGRAM");
  const derivedSource = associatedTokenAddress(payerKey, mint, tokenProgram);
  const sourceOverride = configuredValue("TCAP_SOURCE_TOKEN_ACCOUNT");
  const source = publicKey(sourceOverride ?? derivedSource.toBase58(), "TCAP_SOURCE_TOKEN_ACCOUNT");
  const tipRootCommitment = resolveTipRootCommitment(payerKey);
  const depositAmount = (configuredValue("TCAP_DEPOSIT_AMOUNT") ?? configuredValue("TCAP_AMOUNT"));
  if (!depositAmount) fail("TCAP_DEPOSIT_AMOUNT (or the default-file alias TCAP_AMOUNT) is required");
  if (BigInt(depositAmount) <= 0n) fail("TCAP_DEPOSIT_AMOUNT must be positive");
  const motherEscrow = publicKey(process.env.TSN_MOTHER_ESCROW ?? DEFAULT_TSN_MOTHER_ESCROW, "TSN_MOTHER_ESCROW");
  const config = pda(TCAP_PROGRAM_ID, SEEDS.tcapConfig);
  const registry = pda(TCAP_PROGRAM_ID, SEEDS.tcapRegistry);
  const assetState = pda(TCAP_PROGRAM_ID, SEEDS.tcapAssetState, tokenProgram.toBuffer(), mint.toBuffer());
  const reserveState = pda(TCAP_PROGRAM_ID, SEEDS.tcapReserveState, assetState.toBuffer());
  const vault = pda(TCAP_PROGRAM_ID, SEEDS.tcapFutureVault, assetState.toBuffer());
  const assetEntry = publicKey(process.env.TCAP_ASSET_ENTRY ?? pda(TCAP_PROGRAM_ID, SEEDS.tcapAssetEntry, registry.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()).toBase58(), "TCAP_ASSET_ENTRY");
  const tipRoot = new PublicKey(tipRootCommitment);
  const tip = pda(TCAP_PROGRAM_ID, SEEDS.tcapTinTip, tipRootCommitment);

  const [motherInfo, sourceInfo, vaultInfo, assetStateInfo, reserveInfo, assetEntryInfo, tipInfo, configInfo] = await Promise.all([
    connection.getAccountInfo(motherEscrow, "confirmed"),
    connection.getAccountInfo(source, "confirmed"),
    connection.getAccountInfo(vault, "confirmed"),
    connection.getAccountInfo(assetState, "confirmed"),
    connection.getAccountInfo(reserveState, "confirmed"),
    connection.getAccountInfo(assetEntry, "confirmed"),
    connection.getAccountInfo(tip, "confirmed"),
    connection.getAccountInfo(config, "confirmed"),
  ]);
  if (!motherInfo?.owner.equals(TSN_PROGRAM_ID)) fail("TSN_MOTHER_ESCROW is not owned by the pinned TSN program");
  if (!configInfo?.owner.equals(TCAP_PROGRAM_ID)) fail("TCAP global config is not owned by the pinned TCAP program");
  if (!assetEntryInfo?.owner.equals(TCAP_PROGRAM_ID)) fail("TCAP_ASSET_ENTRY is not owned by the pinned TCAP program");
  if (!assetStateInfo || !reserveInfo) {
    const missing = [
      !assetStateInfo ? `asset state ${assetState.toBase58()}` : undefined,
      !reserveInfo ? `reserve state ${reserveState.toBase58()}` : undefined,
    ].filter(Boolean).join(", ");
    fail(`TCAP V2 ${missing} is missing; initialize the governed asset state before running this V2 scenario`);
  }
  if (!assetStateInfo.owner.equals(TCAP_PROGRAM_ID) || !reserveInfo.owner.equals(TCAP_PROGRAM_ID)) fail("TCAP V2 asset state/reserve is not owned by the pinned TCAP program");
  if (!vaultInfo?.owner.equals(tokenProgram) || !sourceInfo?.owner.equals(tokenProgram)) fail("source and governed vault are not owned by TCAP_TOKEN_PROGRAM");
  const motherAuthority = readMotherAuthority(motherInfo, motherEscrow);
  if (!motherAuthority.equals(motherKey)) fail(`configured Mother authority wallet ${motherKey.toBase58()} does not match MotherEscrow authority ${motherAuthority.toBase58()}`);
  if (!sourceInfo) {
    if (!sourceOverride) fail(`derived associated token account ${derivedSource.toBase58()} does not exist; set TCAP_SOURCE_TOKEN_ACCOUNT to an initialized wallet-owned token account`);
    fail("TCAP_SOURCE_TOKEN_ACCOUNT does not exist");
  }
  if (!vaultInfo || !assetStateInfo || !reserveInfo) fail("TCAP V2 asset state, reserve, vault, or source account is missing; initialize the governed asset before running this scenario");
  readAssetState(assetStateInfo, assetState, reserveState, vault, mint, tokenProgram);
  readReserveState(reserveInfo, reserveState, assetState, vault);
  if (!tokenOwner(sourceInfo, "TCAP_SOURCE_TOKEN_ACCOUNT").equals(payerKey)) fail("TCAP_SOURCE_TOKEN_ACCOUNT is not owned by the wallet signer");
  if (!tokenMint(sourceInfo, "TCAP_SOURCE_TOKEN_ACCOUNT").equals(mint)) fail("TCAP_SOURCE_TOKEN_ACCOUNT mint does not match TCAP_MINT");
  if (!tokenMint(vaultInfo, "TCAP future vault").equals(mint)) fail("TCAP future vault mint does not match TCAP_MINT");
  const skipFunding = configuredValue("TCAP_SKIP_FUNDING") === "1";
  if (!skipFunding && tokenAmount(sourceInfo, "TCAP_SOURCE_TOKEN_ACCOUNT") < BigInt(depositAmount)) fail("TCAP_SOURCE_TOKEN_ACCOUNT does not contain TCAP_DEPOSIT_AMOUNT");
  const asset = readAssetEntry(assetEntryInfo, assetEntry);
  if (!asset.tokenProgram.equals(tokenProgram) || !asset.mint.equals(mint)) fail("TCAP_ASSET_ENTRY does not bind the requested token program and mint");
  const assetStateData = accountData(assetStateInfo);
  const assetStateReserve = new PublicKey(assetStateData.subarray(108, 140));
  const assetStateVault = new PublicKey(assetStateData.subarray(140, 172));
  const assetStateAuthority = new PublicKey(assetStateData.subarray(172, 204));
  if (!asset.reserveState.equals(assetStateReserve) || !asset.vault.equals(assetStateVault) || !asset.reserveAuthority.equals(assetStateAuthority)) {
    fail(`TCAP custody graph is split; asset entry reserve=${asset.reserveState.toBase58()} vault=${asset.vault.toBase58()} but asset state reserve=${assetStateReserve.toBase58()} vault=${assetStateVault.toBase58()}. Run tcap:custody-graph:v2:migrate:devnet after deploying the governed migration.`);
  }
  if (asset.status !== 1 || asset.riskState !== 1 || asset.paused || asset.deprecated) fail("TCAP asset entry is not Active + Approved + unpaused");
  const tcapConfig = readConfig(configInfo, config);
  if (!tcapConfig.approvedTsnProgram.equals(TSN_PROGRAM_ID)) fail("TCAP config does not approve the pinned TSN program");
  if (tcapConfig.paused) fail("TCAP global config is paused");
  const tipBefore = readTip(tipInfo, tip);
  if (tipBefore.frozen) fail("TCAP tip is frozen");
  if (tipBefore.previousCommitment.equals(Buffer.alloc(32))) fail("TCAP tip has an empty current commitment");

  // Tx1 may already have succeeded when Tx2 fails (for example while an
  // older TCAP deployment lacks credit_tcap_tin_tip_v2). Allow an explicit
  // retry without depositing the same liquidity twice.
  let fundingSignature = null;
  let fundingTx = null;
  if (!skipFunding) {
    const depositIx = buildDepositAssetV2Instruction({ payer: payerKey, config, assetState, assetEntry, reserveState, source, vault, mint, tokenProgram, amount: depositAmount });
    fundingSignature = await sendAndConfirmTransaction(connection, new Transaction().add(depositIx), [payer], { commitment: "confirmed" });
    fundingTx = await confirmedTransaction(connection, fundingSignature);
  }
  const [sourceAfterInfo, vaultAfterInfo, reserveAfterInfo] = await Promise.all([
    connection.getAccountInfo(source, "confirmed"),
    connection.getAccountInfo(vault, "confirmed"),
    connection.getAccountInfo(reserveState, "confirmed"),
  ]);

  const validAfterSlot = await connection.getSlot("confirmed");
  const slotWindow = Number(process.env.TCAP_CREDIT_SLOT_WINDOW ?? "150");
  if (!Number.isSafeInteger(slotWindow) || slotWindow < 1) fail("TCAP_CREDIT_SLOT_WINDOW must be a positive safe integer");
  const expiresAtSlot = validAfterSlot + slotWindow;
  const newCommitment = bytes32(process.env.TCAP_NEW_COMMITMENT, "TCAP_NEW_COMMITMENT");
  const gpruScopeCommitment = bytes32(process.env.TCAP_GPRU_SCOPE_COMMITMENT, "TCAP_GPRU_SCOPE_COMMITMENT");
  const nullifier = bytes32(process.env.TCAP_CREDIT_NULLIFIER, "TCAP_CREDIT_NULLIFIER");
  if (newCommitment.equals(tipBefore.previousCommitment)) fail("TCAP_NEW_COMMITMENT must differ from the current tip commitment");
  if (nullifier.equals(tipBefore.lastTransitionNullifier ?? Buffer.alloc(0))) fail("TCAP_CREDIT_NULLIFIER must differ from the tip's last transition nullifier");
  const sequence = tipBefore.sequence + 1n;
  const authorizationDigest = deriveGpruTcapCreditAuthorizationDigest({
    tip,
    validAfterSlot,
    expiresAtSlot,
    previousCommitment: tipBefore.previousCommitment,
    newCommitment,
    sequence,
    tokenId: asset.tokenId,
    policyCommitment: tipBefore.policyCommitment,
    gpruScopeCommitment,
    nullifier,
  });
  const creditIx = buildTsnRegisterTcapCreditAuthorizationV2Instruction({
    payer: motherKey,
    motherEscrow,
    tipRootCommitment,
    authorizationDigest,
    previousCommitment: tipBefore.previousCommitment,
    newCommitment,
    sequence,
    tokenId: asset.tokenId,
    policyCommitment: tipBefore.policyCommitment,
    gpruScopeCommitment,
    nullifier,
    validAfterSlot,
    expiresAtSlot,
    assetEntry,
  });
  const authSigner = pda(TSN_PROGRAM_ID, SEEDS.tcapAuth, authorizationDigest);
  const creditAllowedAccounts = [motherKey, motherEscrow, TCAP_PROGRAM_ID, TSN_PROGRAM_ID, config, assetEntry, tipRoot, tip, authSigner, SystemProgram.programId];
  const fundingAccounts = new Set([source.toBase58(), assetState.toBase58(), reserveState.toBase58(), vault.toBase58(), mint.toBase58(), tokenProgram.toBase58(), registry.toBase58()]);
  const creditSignature = await sendAndConfirmTransaction(connection, new Transaction().add(creditIx), [motherPayer], { commitment: "confirmed" });
  const creditEvidence = await inspectCreditTransaction(connection, creditSignature, { allowedAccounts: creditAllowedAccounts, forbiddenAddresses: new Set([tcapConfig.commitmentRoot.toBase58()]), fundingAccounts, tip, sequence, newCommitment });
  console.log(JSON.stringify({
    status: "PASSED",
    scenario: "TCAP V2 funding + GPRU credit",
    programs: { tsn: TSN_PROGRAM_ID.toBase58(), tcap: TCAP_PROGRAM_ID.toBase58() },
    funding: {
      instruction: skipFunding ? "deposit_asset_v2 (skipped; prior funding retained)" : "deposit_asset_v2",
      signature: fundingSignature,
      slot: fundingTx?.slot ?? null,
      amountBaseUnits: depositAmount,
      sourceTokenAccount: source.toBase58(),
      sourceResolution: sourceOverride ? "explicit" : "derived-associated-token-account",
      governedVault: vault.toBase58(),
      sourceBalanceAfter: tokenAmount(sourceAfterInfo, "source after funding").toString(),
      vaultBalanceAfter: tokenAmount(vaultAfterInfo, "vault after funding").toString(),
      reserveStatePresent: Boolean(reserveAfterInfo),
    },
    credit: {
      instruction: "tsn_register_tcap_credit_authorization_v2 -> credit_tcap_tin_tip_v2",
      signature: creditEvidence.signature,
      slot: creditEvidence.slot,
      tip: tip.toBase58(),
      sequence: sequence.toString(),
      authorizationDigest: authorizationDigest.toString("hex"),
      accountKeys: creditEvidence.accountKeys,
      v2Instructions: creditEvidence.v2Instructions,
    },
    unlinkability: {
      status: "PASSED",
      forbiddenAccounts: creditEvidence.forbiddenAccounts,
      forbiddenInstructions: creditEvidence.forbiddenInstructions,
      fundingAccountsInCredit: creditEvidence.fundingAccountsInCredit,
      note: "Credit transaction contains only opaque GPRU tip-transition accounts; funding bookkeeping and token accounts are absent.",
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "FAILED", scenario: "TCAP V2 funding + GPRU credit", error: sanitizedError(error) }, null, 2));
  process.exitCode = 1;
});
