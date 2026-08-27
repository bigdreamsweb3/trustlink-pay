#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

export const TCAP_PROGRAM_ID = new PublicKey(
  "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
);
export const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);

const BPF_LOADERS = new Set([
  "BPFLoader1111111111111111111111111111111111",
  "BPFLoader2111111111111111111111111111111111",
  "BPFLoaderUpgradeab1e11111111111111111111111",
  "LoaderV411111111111111111111111111111111111",
]);
const STATUS_V1 = ["PROPOSED", "ACTIVE", "DEPOSITS_PAUSED", "WITHDRAWALS_ONLY", "DEPRECATED"];
const RISK_V1 = ["PENDING_REVIEW", "APPROVED", "RESTRICTED", "BLOCKED"];
const APPROVAL_V2 = ["PENDING", "APPROVED", "REJECTED", "REVOKED"];
const OPERATIONAL_V2 = ["INACTIVE", "ACTIVE", "PAUSED", "DEPRECATED"];
const MINT_PROFILE_V2 = ["STANDARD_PUBLIC", "CONFIDENTIAL_TRANSFER_ENABLED"];
const MUTATION_COMMANDS = new Set([
  "register",
  "approve",
  "reject",
  "revoke",
  "revoke-approval",
  "activate",
  "deactivate",
  "pause",
  "resume",
  "disable-deposits",
  "enable-deposits",
  "disable-settlements",
  "enable-settlements",
  "disable-settlement",
  "enable-settlement",
  "deprecate",
  "initialize-reserve",
  "initialize-vault",
  "sync-infrastructure",
  "migrate-legacy",
  "raise-version-gate",
  "retire",
  "close",
]);
const V2_LOG_NAMES = new Set([
  "RegisterGovernedAssetV2",
  "RaiseMinimumInstructionVersionV2",
  "MigrateLegacyAssetPolicyV2",
  "SetAssetApprovalV2",
  "SetAssetOperationalStatusV2",
  "RevokeAssetApprovalV2",
  "SetAssetSettlementPolicyV2",
  "InitializeGovernedReserveV2",
  "InitializeGovernedVaultV2",
  "SyncGovernedAssetInfrastructureV2",
  "SetGovernedDepositPolicyV2",
  "DepositAssetV2",
  "DepositWithFundingCommitmentV2",
]);

const ZERO_PUBLIC_KEY = new PublicKey(new Uint8Array(32));
const APPROVAL_INPUT = Object.freeze({ pending: 0, approved: 1, rejected: 2, revoked: 3 });
const OPERATIONAL_INPUT = Object.freeze({ inactive: 0, active: 1, paused: 2, deprecated: 3 });
const MINT_PROFILE_INPUT = Object.freeze({
  "standard-public": 0,
  "confidential-transfer-enabled": 1,
});

const SEEDS = Object.freeze({
  config: "tcap:global-config:v1",
  registry: "tcap:asset-registry:v1",
  asset: "tcap:asset-entry:v1",
  reserve: "tcap:reserve-state:v1",
  reserveAuthority: "tcap:reserve-authority:v1",
  vault: "tcap:future-vault:v1",
  governance: "tcap:asset-governance:v2",
  extensions: "tcap:extension-policy:v2",
});

function accountDiscriminator(name) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

const DISCRIMINATORS = Object.freeze({
  config: accountDiscriminator("TcapGlobalConfigV1"),
  registry: accountDiscriminator("TcapAssetRegistryV1"),
  asset: accountDiscriminator("TcapAssetEntryV1"),
  reserve: accountDiscriminator("TcapReserveStateV1"),
  governance: accountDiscriminator("TcapAssetGovernancePolicyV2"),
  extensions: accountDiscriminator("TcapAssetExtensionPolicyV2"),
  fundingClaim: accountDiscriminator("FundingClaimV1"),
});

function hasDiscriminator(data, discriminator) {
  return data.length >= 8 && data.subarray(0, 8).equals(discriminator);
}

function assertLength(data, expected, label) {
  if (data.length < expected) {
    throw new Error(`${label} account is truncated: expected at least ${expected} bytes, received ${data.length}`);
  }
}

function pubkey(data, offset) {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function hex(data, offset, length) {
  return data.subarray(offset, offset + length).toString("hex");
}

function u64(data, offset) {
  return data.readBigUInt64LE(offset).toString();
}

function enumName(values, value) {
  return values[value] ?? `UNKNOWN_${value}`;
}

export function decodeAssetEntry(data) {
  assertLength(data, 287, "TcapAssetEntryV1");
  if (!hasDiscriminator(data, DISCRIMINATORS.asset)) throw new Error("Not a TcapAssetEntryV1 account");
  return {
    version: data.readUInt16LE(8),
    protocolVersion: data.readUInt16LE(10),
    registry: pubkey(data, 12),
    tokenProgram: pubkey(data, 48),
    mint: pubkey(data, 80),
    registryVersion: data.readUInt32LE(112),
    assetCommitment: hex(data, 116, 32),
    reserve: pubkey(data, 148),
    canonicalVault: pubkey(data, 180),
    reserveAuthority: pubkey(data, 212),
    decimals: data.readUInt8(244),
    depositsEnabled: data.readUInt8(245) !== 0,
    withdrawalsEnabled: data.readUInt8(246) !== 0,
    paused: data.readUInt8(247) !== 0,
    transferFeePolicy: data.readUInt8(248),
    freezeAuthorityPolicy: data.readUInt8(249),
    issuerControlPolicy: data.readUInt8(250),
    governanceApproval: hex(data, 251, 32),
    operationalStatusV1: enumName(STATUS_V1, data.readUInt8(283)),
    riskStatusV1: enumName(RISK_V1, data.readUInt8(284)),
    deprecated: data.readUInt8(285) !== 0,
    bump: data.readUInt8(286),
  };
}

export function decodeReserve(data) {
  assertLength(data, 193, "TcapReserveStateV1");
  if (!hasDiscriminator(data, DISCRIMINATORS.reserve)) throw new Error("Not a TcapReserveStateV1 account");
  const result = {
    version: data.readUInt16LE(8),
    protocolVersion: data.readUInt16LE(10),
    assetState: pubkey(data, 12),
    assetEntry: pubkey(data, 44),
    canonicalVault: pubkey(data, 76),
    reserveAuthority: pubkey(data, 108),
    actualAssets: u64(data, 140),
    pendingFundingLiabilities: u64(data, 148),
    settledConfidentialLiabilities: u64(data, 156),
    authorizedWithdrawalLiabilities: u64(data, 164),
    reservedRefundLiabilities: u64(data, 172),
    accountingEpoch: u64(data, 180),
    fundingEnabled: data.readUInt8(188) !== 0,
    paused: data.readUInt8(189) !== 0,
    bump: data.readUInt8(190),
    reserveAuthorityBump: data.readUInt8(191),
    canonicalVaultBump: data.readUInt8(192),
  };
  result.totalLiabilities = (
    BigInt(result.pendingFundingLiabilities)
    + BigInt(result.settledConfidentialLiabilities)
    + BigInt(result.authorizedWithdrawalLiabilities)
    + BigInt(result.reservedRefundLiabilities)
  ).toString();
  return result;
}

export function decodeGovernancePolicy(data) {
  assertLength(data, 222, "TcapAssetGovernancePolicyV2");
  if (!hasDiscriminator(data, DISCRIMINATORS.governance)) {
    throw new Error("Not a TcapAssetGovernancePolicyV2 account");
  }
  return {
    version: data.readUInt16LE(8),
    policyVersion: data.readUInt16LE(10),
    registry: pubkey(data, 12),
    assetEntry: pubkey(data, 44),
    mint: pubkey(data, 76),
    tokenProgram: pubkey(data, 108),
    approvalStatus: enumName(APPROVAL_V2, data.readUInt8(140)),
    operationalStatus: enumName(OPERATIONAL_V2, data.readUInt8(141)),
    depositsEnabled: data.readUInt8(142) !== 0,
    settlementsEnabled: data.readUInt8(143) !== 0,
    publicExitEnabled: data.readUInt8(144) !== 0,
    confidentialSettlementEnabled: data.readUInt8(145) !== 0,
    reserveInitialized: data.readUInt8(146) !== 0,
    vaultInitialized: data.readUInt8(147) !== 0,
    deprecatedIrreversible: data.readUInt8(148) !== 0,
    lastUpdatedSlot: u64(data, 149),
    authority: pubkey(data, 157),
    bump: data.readUInt8(189),
  };
}

export function decodeExtensionPolicy(data) {
  assertLength(data, 271, "TcapAssetExtensionPolicyV2");
  if (!hasDiscriminator(data, DISCRIMINATORS.extensions)) {
    throw new Error("Not a TcapAssetExtensionPolicyV2 account");
  }
  return {
    version: data.readUInt16LE(8),
    assetEntry: pubkey(data, 10),
    mint: pubkey(data, 42),
    tokenProgram: pubkey(data, 74),
    decimals: data.readUInt8(106),
    mintProfile: enumName(MINT_PROFILE_V2, data.readUInt8(107)),
    requiredExtensionBitmap: u64(data, 108),
    allowedExtensionBitmap: u64(data, 116),
    observedExtensionBitmap: u64(data, 124),
    extensionConfigHash: hex(data, 132, 32),
    expectedMintAuthority: pubkey(data, 164),
    expectedFreezeAuthority: pubkey(data, 196),
    confidentialTransferEnabled: data.readUInt8(228) !== 0,
    metadataPointerEnabled: data.readUInt8(229) !== 0,
    tokenMetadataEnabled: data.readUInt8(230) !== 0,
    transferFeeEnabled: data.readUInt8(231) !== 0,
    transferHookEnabled: data.readUInt8(232) !== 0,
    permanentDelegateEnabled: data.readUInt8(233) !== 0,
    defaultAccountStateEnabled: data.readUInt8(234) !== 0,
    nonTransferableEnabled: data.readUInt8(235) !== 0,
    interestBearingEnabled: data.readUInt8(236) !== 0,
    mintCloseAuthorityEnabled: data.readUInt8(237) !== 0,
    bump: data.readUInt8(238),
  };
}

export function decodeRegistry(data) {
  assertLength(data, 116, "TcapAssetRegistryV1");
  if (!hasDiscriminator(data, DISCRIMINATORS.registry)) throw new Error("Not a TcapAssetRegistryV1 account");
  return {
    version: data.readUInt16LE(8),
    config: pubkey(data, 10),
    authority: pubkey(data, 42),
    registryVersion: data.readUInt32LE(74),
    entryRoot: hex(data, 78, 32),
    entryCount: data.readUInt32LE(110),
    frozen: data.readUInt8(114) !== 0,
    bump: data.readUInt8(115),
  };
}

export function decodeGlobalConfig(data) {
  assertLength(data, 244, "TcapGlobalConfigV1");
  if (!hasDiscriminator(data, DISCRIMINATORS.config)) throw new Error("Not a TcapGlobalConfigV1 account");
  return {
    version: data.readUInt16LE(8),
    protocolVersion: data.readUInt16LE(10),
    minimumInstructionVersion: data.readUInt16LE(12),
    governanceAuthority: pubkey(data, 14),
    registryAuthority: pubkey(data, 46),
    assetRegistry: pubkey(data, 78),
    emergencyAuthority: pubkey(data, 110),
    approvedTsnProgram: pubkey(data, 142),
    proofVerifierProgram: pubkey(data, 174),
    proofVerifierEnabled: data.readUInt8(206) !== 0,
    paused: data.readUInt8(207) !== 0,
    commitmentRootState: pubkey(data, 208),
    domainVersion: data.readUInt16LE(240),
    migrationState: data.readUInt8(242),
    bump: data.readUInt8(243),
  };
}

export function decodeFundingClaim(data) {
  assertLength(data, 335, "FundingClaimV1");
  if (!hasDiscriminator(data, DISCRIMINATORS.fundingClaim)) throw new Error("Not a FundingClaimV1 account");
  return {
    version: data.readUInt16LE(8),
    protocolVersion: data.readUInt16LE(10),
    config: pubkey(data, 12),
    assetEntry: pubkey(data, 44),
    reserve: pubkey(data, 76),
    fundingIdentifier: hex(data, 108, 32),
    fundingCommitment: hex(data, 140, 32),
    amount: u64(data, 172),
    settlementMode: enumName(["CONFIDENTIAL_OWNER", "PUBLIC_WALLET"], data.readUInt8(180)),
    destinationCommitment: hex(data, 181, 32),
    depositorAuthorizationCommitment: hex(data, 213, 32),
    authorizationNonce: u64(data, 245),
    expiresAtSlot: u64(data, 253),
    feeAuthorizationCommitment: hex(data, 261, 32),
    domainSeparator: hex(data, 293, 32),
    fundingRootSequence: u64(data, 325),
    status: enumName(["PENDING"], data.readUInt8(333)),
    bump: data.readUInt8(334),
  };
}

export function deriveAssetAddresses(mintValue, tokenProgramValue, programValue = TCAP_PROGRAM_ID) {
  const program = new PublicKey(programValue);
  const mint = new PublicKey(mintValue);
  const tokenProgram = new PublicKey(tokenProgramValue);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from(SEEDS.config)], program);
  const [registry] = PublicKey.findProgramAddressSync([Buffer.from(SEEDS.registry)], program);
  const [assetEntry] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.asset), registry.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    program,
  );
  const [governancePolicy] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.governance), assetEntry.toBuffer()],
    program,
  );
  const [extensionPolicy] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.extensions), assetEntry.toBuffer()],
    program,
  );
  const [reserve] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.reserve), assetEntry.toBuffer()],
    program,
  );
  const [reserveAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.reserveAuthority), assetEntry.toBuffer()],
    program,
  );
  const [canonicalVault] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.vault), assetEntry.toBuffer()],
    program,
  );
  return Object.fromEntries(Object.entries({
    config,
    registry,
    assetEntry,
    governancePolicy,
    extensionPolicy,
    reserve,
    reserveAuthority,
    canonicalVault,
  }).map(([key, value]) => [key, value.toBase58()]));
}

function decodeMint(data) {
  assertLength(data, 82, "SPL mint");
  const authorityOption = data.readUInt32LE(0);
  const freezeOption = data.readUInt32LE(46);
  return {
    mintAuthority: authorityOption === 0 ? null : pubkey(data, 4),
    supply: u64(data, 36),
    decimals: data.readUInt8(44),
    initialized: data.readUInt8(45) !== 0,
    freezeAuthority: freezeOption === 0 ? null : pubkey(data, 50),
    accountBytes: data.length,
  };
}

function decodeTokenAccount(data) {
  assertLength(data, 165, "SPL token account");
  return {
    mint: pubkey(data, 0),
    authority: pubkey(data, 32),
    amount: u64(data, 64),
    state: enumName(["UNINITIALIZED", "INITIALIZED", "FROZEN"], data.readUInt8(108)),
    accountBytes: data.length,
  };
}

function check(name, passed, expected, observed, blocking = true) {
  return { name, status: passed ? "PASS" : "FAIL", expected, observed, blocking };
}

function missingAccount(address, expectedOwner = null) {
  return { address, exists: false, owner: null, expectedOwner, ownerMatches: false };
}

function accountEnvelope(address, info, expectedOwner = null) {
  if (!info) return missingAccount(address, expectedOwner);
  const owner = info.owner.toBase58();
  return {
    address,
    exists: true,
    owner,
    expectedOwner,
    ownerMatches: expectedOwner === null || owner === expectedOwner,
    executable: info.executable,
    lamports: info.lamports,
    dataBytes: info.data.length,
  };
}

export async function inspectAsset(connection, mintValue, tokenProgramValue = null) {
  const mint = new PublicKey(mintValue);
  let tokenProgram = tokenProgramValue ? new PublicKey(tokenProgramValue) : null;
  const mintInfo = await connection.getAccountInfo(mint, "confirmed");
  if (!mintInfo) {
    return {
      status: "MINT_NOT_FOUND",
      evidenceClass: "CONFIRMED_DEVNET_ACCOUNT_READ",
      mint: mint.toBase58(),
    };
  }
  if (!tokenProgram) tokenProgram = mintInfo.owner;
  const addresses = deriveAssetAddresses(mint, tokenProgram);
  const publicKeys = Object.fromEntries(
    Object.entries(addresses).map(([name, address]) => [name, new PublicKey(address)]),
  );
  const [programInfo, configInfo, registryInfo, entryInfo, governanceInfo, extensionInfo, reserveInfo, vaultInfo] =
    await connection.getMultipleAccountsInfo([
      TCAP_PROGRAM_ID,
      publicKeys.config,
      publicKeys.registry,
      publicKeys.assetEntry,
      publicKeys.governancePolicy,
      publicKeys.extensionPolicy,
      publicKeys.reserve,
      publicKeys.canonicalVault,
    ], "confirmed");

  const result = {
    status: "INSPECTED",
    evidenceClass: "CONFIRMED_DEVNET_ACCOUNT_READ",
    program: accountEnvelope(TCAP_PROGRAM_ID.toBase58(), programInfo),
    addresses,
    mint: {
      ...accountEnvelope(mint.toBase58(), mintInfo, tokenProgram.toBase58()),
      ...decodeMint(mintInfo.data),
      tokenProgram: tokenProgram.toBase58(),
      tokenProgramSupported: tokenProgram.equals(SPL_TOKEN_PROGRAM_ID) || tokenProgram.equals(TOKEN_2022_PROGRAM_ID),
    },
    config: accountEnvelope(addresses.config, configInfo, TCAP_PROGRAM_ID.toBase58()),
    registry: accountEnvelope(addresses.registry, registryInfo, TCAP_PROGRAM_ID.toBase58()),
    assetEntry: accountEnvelope(addresses.assetEntry, entryInfo, TCAP_PROGRAM_ID.toBase58()),
    governancePolicy: accountEnvelope(addresses.governancePolicy, governanceInfo, TCAP_PROGRAM_ID.toBase58()),
    extensionPolicy: accountEnvelope(addresses.extensionPolicy, extensionInfo, TCAP_PROGRAM_ID.toBase58()),
    reserve: accountEnvelope(addresses.reserve, reserveInfo, TCAP_PROGRAM_ID.toBase58()),
    canonicalVault: accountEnvelope(addresses.canonicalVault, vaultInfo, tokenProgram.toBase58()),
    checks: [],
  };

  if (programInfo) {
    result.program.ownerIsLoader = BPF_LOADERS.has(programInfo.owner.toBase58());
  }
  if (configInfo?.owner.equals(TCAP_PROGRAM_ID)) Object.assign(result.config, decodeGlobalConfig(configInfo.data));
  if (registryInfo?.owner.equals(TCAP_PROGRAM_ID)) Object.assign(result.registry, decodeRegistry(registryInfo.data));
  if (entryInfo?.owner.equals(TCAP_PROGRAM_ID)) {
    try { Object.assign(result.assetEntry, decodeAssetEntry(entryInfo.data)); }
    catch { result.assetEntry.layout = "LEGACY_OR_TRUNCATED"; }
  }
  if (governanceInfo?.owner.equals(TCAP_PROGRAM_ID)) {
    Object.assign(result.governancePolicy, decodeGovernancePolicy(governanceInfo.data));
  }
  if (extensionInfo?.owner.equals(TCAP_PROGRAM_ID)) {
    Object.assign(result.extensionPolicy, decodeExtensionPolicy(extensionInfo.data));
  }
  if (reserveInfo?.owner.equals(TCAP_PROGRAM_ID)) Object.assign(result.reserve, decodeReserve(reserveInfo.data));
  if (vaultInfo?.owner.equals(tokenProgram)) Object.assign(result.canonicalVault, decodeTokenAccount(vaultInfo.data));

  const add = (...args) => result.checks.push(check(...args));
  add("TCAP program is executable", programInfo?.executable === true, true, programInfo?.executable ?? null);
  add("TCAP program uses a recognized loader", result.program.ownerIsLoader === true, true, result.program.owner ?? null);
  add("Mint is owned by selected token program", mintInfo.owner.equals(tokenProgram), tokenProgram.toBase58(), mintInfo.owner.toBase58());
  add("Token program is supported", result.mint.tokenProgramSupported, "classic SPL Token or Token-2022", tokenProgram.toBase58());
  add("Asset entry exists", entryInfo !== null, true, entryInfo !== null);

  if (result.assetEntry.exists) {
    add("Asset entry PDA is canonical", result.assetEntry.address === addresses.assetEntry, addresses.assetEntry, result.assetEntry.address);
    add("Asset entry mint matches", result.assetEntry.mint === mint.toBase58(), mint.toBase58(), result.assetEntry.mint);
    add("Asset entry token program matches", result.assetEntry.tokenProgram === tokenProgram.toBase58(), tokenProgram.toBase58(), result.assetEntry.tokenProgram);
    add("Asset entry decimals match mint", result.assetEntry.decimals === result.mint.decimals, result.mint.decimals, result.assetEntry.decimals);
    add("Stored reserve is canonical", result.assetEntry.reserve === addresses.reserve, addresses.reserve, result.assetEntry.reserve);
    add("Stored vault is canonical", result.assetEntry.canonicalVault === addresses.canonicalVault, addresses.canonicalVault, result.assetEntry.canonicalVault);
    add("Stored reserve authority is canonical", result.assetEntry.reserveAuthority === addresses.reserveAuthority, addresses.reserveAuthority, result.assetEntry.reserveAuthority);
  }
  if (result.governancePolicy.exists) {
    add("Governance policy binds asset", result.governancePolicy.assetEntry === addresses.assetEntry, addresses.assetEntry, result.governancePolicy.assetEntry);
    add("Governance policy binds mint", result.governancePolicy.mint === mint.toBase58(), mint.toBase58(), result.governancePolicy.mint);
    add("Governance policy binds token program", result.governancePolicy.tokenProgram === tokenProgram.toBase58(), tokenProgram.toBase58(), result.governancePolicy.tokenProgram);
  }
  if (result.extensionPolicy.exists) {
    add("Extension policy binds asset", result.extensionPolicy.assetEntry === addresses.assetEntry, addresses.assetEntry, result.extensionPolicy.assetEntry);
    add("Extension policy binds mint", result.extensionPolicy.mint === mint.toBase58(), mint.toBase58(), result.extensionPolicy.mint);
    add("Extension policy binds token program", result.extensionPolicy.tokenProgram === tokenProgram.toBase58(), tokenProgram.toBase58(), result.extensionPolicy.tokenProgram);
    add("Extension policy decimals match mint", result.extensionPolicy.decimals === result.mint.decimals, result.mint.decimals, result.extensionPolicy.decimals);
  }
  if (result.reserve.exists) {
    add("Reserve binds asset entry", result.reserve.assetEntry === addresses.assetEntry, addresses.assetEntry, result.reserve.assetEntry);
    add("Reserve binds canonical vault", result.reserve.canonicalVault === addresses.canonicalVault, addresses.canonicalVault, result.reserve.canonicalVault);
    add("Reserve binds authority", result.reserve.reserveAuthority === addresses.reserveAuthority, addresses.reserveAuthority, result.reserve.reserveAuthority);
  }
  if (result.canonicalVault.exists) {
    add("Vault mint matches asset mint", result.canonicalVault.mint === mint.toBase58(), mint.toBase58(), result.canonicalVault.mint);
    add("Vault authority is canonical", result.canonicalVault.authority === addresses.reserveAuthority, addresses.reserveAuthority, result.canonicalVault.authority);
  }
  if (result.reserve.exists && result.canonicalVault.exists) {
    add("actual_assets equals vault balance", result.reserve.actualAssets === result.canonicalVault.amount, result.reserve.actualAssets, result.canonicalVault.amount);
    add("Assets cover liabilities", BigInt(result.reserve.actualAssets) >= BigInt(result.reserve.totalLiabilities), `>= ${result.reserve.totalLiabilities}`, result.reserve.actualAssets);
  }

  let fundingClaims = [];
  if (result.assetEntry.exists) {
    const claimAccounts = await connection.getProgramAccounts(TCAP_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [{ dataSize: 335 }],
    });
    fundingClaims = claimAccounts
      .filter(({ account }) => hasDiscriminator(account.data, DISCRIMINATORS.fundingClaim))
      .map(({ pubkey: address, account }) => ({ address: address.toBase58(), ...decodeFundingClaim(account.data) }))
      .filter((claim) => claim.assetEntry === addresses.assetEntry);
  }
  result.fundingClaims = {
    count: fundingClaims.length,
    pendingCount: fundingClaims.filter(({ status }) => status === "PENDING").length,
    pendingAmount: fundingClaims.reduce((total, claim) => total + BigInt(claim.amount), 0n).toString(),
    accounts: fundingClaims,
    evidenceClass: "CONFIRMED_DEVNET_ACCOUNT_READ",
  };

  const governed = result.governancePolicy.exists && result.extensionPolicy.exists;
  const acceptedForDeposits = governed
    && result.governancePolicy.approvalStatus === "APPROVED"
    && result.governancePolicy.operationalStatus === "ACTIVE"
    && result.governancePolicy.depositsEnabled
    && result.governancePolicy.reserveInitialized
    && result.governancePolicy.vaultInitialized
    && !result.governancePolicy.deprecatedIrreversible
    && result.reserve.exists
    && result.canonicalVault.exists
    && result.reserve.fundingEnabled
    && !result.reserve.paused
    && result.checks.every((item) => item.status === "PASS");
  const liabilities = result.reserve.exists ? BigInt(result.reserve.totalLiabilities) : 0n;
  const actualAssets = result.reserve.exists ? BigInt(result.reserve.actualAssets) : 0n;
  const vaultBalance = result.canonicalVault.exists ? BigInt(result.canonicalVault.amount) : 0n;
  result.lifecycle = {
    governanceModel: governed ? "GOVERNED_V2" : "LEGACY_V1_UNGOVERNED",
    approvalStatus: result.governancePolicy.approvalStatus ?? "NOT_MIGRATED",
    operationalStatus: result.governancePolicy.operationalStatus ?? result.assetEntry.operationalStatusV1 ?? "NOT_REGISTERED",
    acceptedForDeposits,
    acceptedForSettlement: governed
      && result.governancePolicy.approvalStatus === "APPROVED"
      && result.governancePolicy.operationalStatus === "ACTIVE"
      && result.governancePolicy.settlementsEnabled
      && !result.governancePolicy.deprecatedIrreversible,
    legacyDepositFlag: result.assetEntry.depositsEnabled ?? false,
    closeSupported: false,
    safeToRetireByClosing: false,
    retirementRequirement: liabilities > 0n || actualAssets > 0n || vaultBalance > 0n || fundingClaims.length > 0
      ? "DEPRECATE_AND_PRESERVE_TOMBSTONE_LIABILITIES_OR_ASSETS_EXIST"
      : "DEPRECATE_AND_PRESERVE_TOMBSTONE_CLOSE_NOT_IMPLEMENTED",
  };
  result.liabilitySafety = {
    actualAssets: actualAssets.toString(),
    vaultBalance: vaultBalance.toString(),
    totalLiabilities: liabilities.toString(),
    hasCustodiedAssets: actualAssets > 0n || vaultBalance > 0n,
    hasOutstandingLiabilities: liabilities > 0n,
    hasFundingClaimReferences: fundingClaims.length > 0,
    closureDecision: "SAFE_CLOSURE_NOT_IMPLEMENTED_PRESERVE_DEPRECATED_TOMBSTONE",
  };
  result.status = !result.assetEntry.exists
    ? "NOT_REGISTERED_IN_TCAP"
    : acceptedForDeposits
      ? "ACCEPTED_FOR_DEPOSITS"
      : governed
        ? "GOVERNED_NOT_ACCEPTED_FOR_DEPOSITS"
        : "LEGACY_ASSET_MIGRATION_REQUIRED";
  return result;
}

export function sanitizeMessage(value) {
  return String(value ?? "Unknown error")
    .replace(/([?&](?:api[-_]?key|token|secret)=)[^&\s"']+/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/[^\s"']*?\/)(?:[A-Za-z0-9_-]{24,})(?=[/?#\s"']|$)/g, "$1[REDACTED]")
    .slice(0, 1000);
}

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const equals = value.indexOf("=");
    if (equals !== -1) {
      options[value.slice(2, equals)] = value.slice(equals + 1);
    } else if (rest[index + 1] && !rest[index + 1].startsWith("--")) {
      options[value.slice(2)] = rest[index + 1];
      index += 1;
    } else {
      options[value.slice(2)] = true;
    }
  }
  return { command, options, positional };
}

function anchorRpcFromProject() {
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "Anchor.toml");
  try {
    const contents = fs.readFileSync(project, "utf8");
    return contents.match(/^cluster\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

function resolveRpc(options) {
  if (options.cluster && String(options.cluster).toLowerCase() !== "devnet") {
    throw new Error("TCAP asset administration is restricted to --cluster devnet in this release");
  }
  return options.rpc
    ?? process.env.TCAP_RPC_URL
    ?? process.env.ANCHOR_PROVIDER_URL
    ?? anchorRpcFromProject()
    ?? "https://api.devnet.solana.com";
}

async function listAssets(connection) {
  const accounts = await connection.getProgramAccounts(TCAP_PROGRAM_ID, { commitment: "confirmed" });
  const entries = accounts
    .filter(({ account }) => account.data.length >= 287 && hasDiscriminator(account.data, DISCRIMINATORS.asset))
    .map(({ pubkey: address, account }) => ({ address: address.toBase58(), ...decodeAssetEntry(account.data) }));
  const assets = await Promise.all(entries.map((entry) => inspectAsset(connection, entry.mint, entry.tokenProgram)));
  return {
    command: "list",
    status: "LIVE_DEVNET_ASSET_LIST",
    evidenceClass: "CONFIRMED_DEVNET_ACCOUNT_READ",
    programId: TCAP_PROGRAM_ID.toBase58(),
    count: assets.length,
    assets,
    note: "Instruction catalogues and local IDLs are intentionally excluded from live evidence.",
  };
}

async function verifyProgram(connection) {
  const info = await connection.getAccountInfo(TCAP_PROGRAM_ID, "confirmed");
  return {
    address: TCAP_PROGRAM_ID.toBase58(),
    exists: info !== null,
    executable: info?.executable === true,
    owner: info?.owner.toBase58() ?? null,
    ownerIsLoader: info ? BPF_LOADERS.has(info.owner.toBase58()) : false,
  };
}

async function resolveAssetSelector(connection, options, positional, { register = false } = {}) {
  const mintValue = options.mint ?? positional[0] ?? null;
  const assetIdValue = options["asset-id"] ?? null;
  if (register && assetIdValue) throw new Error("register accepts --mint; the canonical asset ID is derived by TCAP");
  if (mintValue) {
    return { mint: new PublicKey(mintValue).toBase58(), tokenProgram: options["token-program"] ?? null };
  }
  if (!assetIdValue) throw new Error("Specify --mint <address> or --asset-id <asset-entry PDA>");
  const address = new PublicKey(assetIdValue);
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) throw new Error("The selected TCAP asset-entry account does not exist on Devnet");
  if (!info.owner.equals(TCAP_PROGRAM_ID)) throw new Error("The selected asset-entry account is not owned by TCAP");
  const decoded = decodeAssetEntry(info.data);
  const derived = deriveAssetAddresses(decoded.mint, decoded.tokenProgram);
  if (derived.assetEntry !== address.toBase58()) throw new Error("The selected asset-entry PDA is not canonical");
  return { mint: decoded.mint, tokenProgram: decoded.tokenProgram, assetId: address.toBase58() };
}

export function liveAcceptanceReason(asset, operation = "deposits") {
  if (!asset.assetEntry?.exists) return "NOT_REGISTERED_IN_TCAP";
  if (!asset.assetEntry.ownerMatches) return "ACCOUNT_OWNER_MISMATCH";
  if (!asset.governancePolicy?.exists || !asset.extensionPolicy?.exists) return "GOVERNANCE_MIGRATION_REQUIRED";
  if (!asset.governancePolicy.ownerMatches || !asset.extensionPolicy.ownerMatches) return "ACCOUNT_OWNER_MISMATCH";
  const approval = asset.governancePolicy.approvalStatus;
  if (approval === "PENDING") return "PENDING_APPROVAL";
  if (approval === "REJECTED") return "REJECTED";
  if (approval === "REVOKED") return "REVOKED";
  if (approval !== "APPROVED") return "STATE_DECODE_FAILED";
  const status = asset.governancePolicy.operationalStatus;
  if (status === "INACTIVE") return "INACTIVE";
  if (status === "PAUSED") return "PAUSED";
  if (status === "DEPRECATED" || asset.governancePolicy.deprecatedIrreversible) return "DEPRECATED";
  if (status !== "ACTIVE") return "STATE_DECODE_FAILED";
  if (!asset.governancePolicy.reserveInitialized || !asset.reserve?.exists) return "RESERVE_NOT_INITIALIZED";
  if (!asset.governancePolicy.vaultInitialized || !asset.canonicalVault?.exists) return "VAULT_NOT_INITIALIZED";
  const failed = new Set((asset.checks ?? []).filter(({ status: result }) => result === "FAIL").map(({ name }) => name));
  if ([...failed].some((name) => name.includes("token program"))) return "WRONG_TOKEN_PROGRAM";
  if ([...failed].some((name) => name.includes("mint"))) return "WRONG_MINT";
  if ([...failed].some((name) => name.includes("Vault") || name.includes("vault") || name.includes("actual_assets"))) {
    return "VAULT_MISMATCH";
  }
  if (failed.size > 0) return "ACCOUNT_OWNER_MISMATCH";
  if (operation === "settlement" && !asset.governancePolicy.settlementsEnabled) return "SETTLEMENT_DISABLED";
  if (operation === "deposits") {
    if (!asset.governancePolicy.depositsEnabled || !asset.assetEntry.depositsEnabled || !asset.reserve.fundingEnabled) {
      return "DEPOSITS_DISABLED";
    }
    if (asset.reserve.paused) return "PAUSED";
  }
  return "ACCEPTED";
}

async function verifyAssets(connection, options, positional) {
  const hasSelector = options.mint ?? options["asset-id"] ?? positional[0] ?? null;
  if (hasSelector) {
    const selected = await resolveAssetSelector(connection, options, positional);
    const asset = await inspectAsset(connection, selected.mint, selected.tokenProgram);
    const failedChecks = asset.checks?.filter(({ status, blocking }) => status === "FAIL" && blocking) ?? [];
    const operation = options.operation ?? "deposits";
    if (!new Set(["deposits", "settlement", "identity"]).has(operation)) {
      throw new Error("--operation must be deposits, settlement, or identity");
    }
    const acceptance = liveAcceptanceReason(asset, operation);
    return {
      command: "verify",
      status: acceptance,
      accepted: acceptance === "ACCEPTED",
      operation,
      program: await verifyProgram(connection),
      failedChecks,
      asset,
    };
  }
  const listed = await listAssets(connection);
  return {
    command: "verify",
    status: listed.assets.every((asset) => asset.checks.every((item) => item.status === "PASS"))
      ? "ALL_DISCOVERED_ACCOUNT_RELATIONSHIPS_VALID"
      : "ACCOUNT_RELATIONSHIP_FAILURE",
    program: await verifyProgram(connection),
    assets: listed.assets,
  };
}

function instructionDiscriminator(name) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export function anchorHandlerName(instructionName) {
  return instructionName
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function parseHex32(value, optionName) {
  if (!/^[0-9a-fA-F]{64}$/.test(String(value ?? ""))) {
    throw new Error(`${optionName} must be exactly 32 bytes encoded as 64 hexadecimal characters`);
  }
  return Buffer.from(value, "hex");
}

function encodeU64(value, optionName) {
  let parsed;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${optionName} must be an unsigned 64-bit integer`);
  }
  if (parsed < 0n || parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${optionName} must be an unsigned 64-bit integer`);
  }
  const output = Buffer.alloc(8);
  output.writeBigUInt64LE(parsed);
  return output;
}

function anchorData(name, fields = []) {
  return Buffer.concat([instructionDiscriminator(name), ...fields]);
}

function meta(address, isSigner, isWritable, role) {
  return {
    pubkey: new PublicKey(address),
    isSigner,
    isWritable,
    role,
  };
}

function materializeInstruction(name, accounts, data, args) {
  return {
    instructionName: name,
    args,
    accountMetas: accounts.map(({ pubkey: account, isSigner, isWritable, role }, index) => ({
      index,
      role,
      address: account.toBase58(),
      signer: isSigner,
      writable: isWritable,
    })),
    instruction: new TransactionInstruction({
      programId: TCAP_PROGRAM_ID,
      keys: accounts.map(({ pubkey: account, isSigner, isWritable }) => ({
        pubkey: account,
        isSigner,
        isWritable,
      })),
      data,
    }),
  };
}

function normalizedCommand(command) {
  if (command === "revoke") return "revoke-approval";
  if (command === "retire") return "deprecate";
  if (command === "disable-settlement") return "disable-settlements";
  if (command === "enable-settlement") return "enable-settlements";
  return command;
}

function registrationPolicy(snapshot, options) {
  const token2022 = snapshot.mint.tokenProgram === TOKEN_2022_PROGRAM_ID.toBase58();
  const profileName = options["mint-profile"] ?? (token2022 ? null : "standard-public");
  if (!(profileName in MINT_PROFILE_INPUT)) {
    throw new Error(
      "Token-2022 registration requires --mint-profile standard-public or confidential-transfer-enabled",
    );
  }
  if (!token2022 && profileName !== "standard-public") {
    throw new Error("Classic SPL Token mints support only the standard-public TCAP profile");
  }
  const requiredDefault = profileName === "confidential-transfer-enabled" ? "1" : "0";
  const allowedDefault = token2022
    ? (profileName === "confidential-transfer-enabled" ? "7" : "6")
    : "0";
  return {
    profileName,
    profile: MINT_PROFILE_INPUT[profileName],
    requiredBitmap: options["required-extension-bitmap"] ?? requiredDefault,
    allowedBitmap: options["allowed-extension-bitmap"] ?? allowedDefault,
  };
}

export function evaluateMutationIdempotency(commandValue, snapshot) {
  const command = normalizedCommand(commandValue);
  const policy = snapshot?.governancePolicy ?? {};
  if (command === "register") {
    if (!snapshot?.assetEntry?.exists) return null;
    return policy.exists
      ? "ALREADY_REGISTERED"
      : "LEGACY_ASSET_EXISTS_USE_MIGRATE_LEGACY";
  }
  if (command === "migrate-legacy") {
    if (!snapshot?.assetEntry?.exists) return "ASSET_ENTRY_NOT_FOUND";
    if (policy.exists && snapshot.extensionPolicy?.exists) return "ALREADY_MIGRATED";
    if (policy.exists || snapshot.extensionPolicy?.exists) return "PARTIAL_V2_POLICY_STATE_REQUIRES_AUDIT";
    return null;
  }
  if (command === "approve" && policy.approvalStatus === "APPROVED") return "ALREADY_APPROVED";
  if (command === "reject" && policy.approvalStatus === "REJECTED") return "ALREADY_REJECTED";
  if (command === "revoke-approval" && policy.approvalStatus === "REVOKED") return "ALREADY_REVOKED";
  const target = {
    activate: "ACTIVE",
    resume: "ACTIVE",
    deactivate: "INACTIVE",
    pause: "PAUSED",
    deprecate: "DEPRECATED",
  }[command];
  if (target && policy.operationalStatus === target) return `ALREADY_${target}`;
  if (command === "initialize-reserve" && snapshot.reserve?.exists) {
    return policy.reserveInitialized
      ? "RESERVE_ALREADY_INITIALIZED"
      : "RESERVE_EXISTS_USE_SYNC_INFRASTRUCTURE";
  }
  if (command === "initialize-vault" && snapshot.canonicalVault?.exists) {
    return policy.vaultInitialized
      ? "VAULT_ALREADY_INITIALIZED"
      : "VAULT_EXISTS_USE_SYNC_INFRASTRUCTURE";
  }
  if (command === "sync-infrastructure" && policy.reserveInitialized && policy.vaultInitialized) {
    return "INFRASTRUCTURE_ALREADY_SYNCED";
  }
  if (command === "enable-deposits" && policy.depositsEnabled) return "DEPOSITS_ALREADY_ENABLED";
  if (command === "disable-deposits" && !policy.depositsEnabled && snapshot.assetEntry?.depositsEnabled === false) {
    return "DEPOSITS_ALREADY_DISABLED";
  }
  if (
    command === "disable-settlements"
    && !policy.settlementsEnabled
    && !policy.publicExitEnabled
    && !policy.confidentialSettlementEnabled
  ) return "SETTLEMENTS_ALREADY_DISABLED";
  return null;
}

export function validateMutationPrerequisites(commandValue, snapshot) {
  const command = normalizedCommand(commandValue);
  const policy = snapshot?.governancePolicy ?? {};
  if (command === "register") {
    if (snapshot.config?.paused) return "TCAP_PROTOCOL_PAUSED";
    if (snapshot.registry?.frozen) return "TCAP_ASSET_REGISTRY_FROZEN";
    return null;
  }
  if (command === "migrate-legacy") return snapshot.assetEntry?.exists ? null : "ASSET_ENTRY_NOT_FOUND";
  if (!snapshot.assetEntry?.exists) return "ASSET_ENTRY_NOT_FOUND";
  if (!policy.exists || !snapshot.extensionPolicy?.exists) return "V2_GOVERNANCE_POLICY_MIGRATION_REQUIRED";
  if (policy.deprecatedIrreversible && command !== "deprecate" && command !== "disable-settlements") {
    return "DEPRECATED_ASSET_IS_IMMUTABLE";
  }
  if (command === "approve") {
    if (policy.operationalStatus !== "INACTIVE") return "APPROVAL_CHANGE_REQUIRES_INACTIVE_ASSET";
    if (policy.approvalStatus !== "PENDING") return "APPROVE_REQUIRES_PENDING_STATUS";
  }
  if (command === "reject") {
    if (policy.operationalStatus !== "INACTIVE") return "APPROVAL_CHANGE_REQUIRES_INACTIVE_ASSET";
    if (policy.approvalStatus !== "PENDING") return "REJECT_REQUIRES_PENDING_STATUS";
  }
  if (command === "revoke-approval" && policy.approvalStatus !== "APPROVED") {
    return "REVOCATION_REQUIRES_APPROVED_STATUS";
  }
  if (command === "initialize-reserve" && policy.approvalStatus !== "APPROVED") {
    return "RESERVE_INITIALIZATION_REQUIRES_APPROVAL";
  }
  if (command === "initialize-vault" && (!policy.reserveInitialized || !snapshot.reserve?.exists)) {
    return "VAULT_INITIALIZATION_REQUIRES_RESERVE";
  }
  if (command === "sync-infrastructure" && (!snapshot.reserve?.exists || !snapshot.canonicalVault?.exists)) {
    return "SYNC_REQUIRES_EXISTING_RESERVE_AND_VAULT";
  }
  if (snapshot.reserve?.exists && !reserveBindingsCanonical(snapshot)) {
    return "RESERVE_BINDINGS_INVALID_REFUSING_TO_INVENT_OR_REBIND_SENSITIVE_PDA";
  }
  const needsInfrastructure = [
    "activate",
    "resume",
    "deactivate",
    "pause",
    "deprecate",
    "revoke-approval",
    "enable-deposits",
    "disable-deposits",
  ].includes(command);
  if (needsInfrastructure && (!snapshot.reserve?.exists || !snapshot.canonicalVault?.exists)) {
    return "OPERATION_REQUIRES_RESERVE_AND_VAULT";
  }
  if ((command === "activate" || command === "resume" || command === "enable-deposits")) {
    if (policy.approvalStatus !== "APPROVED") return "ACTIVE_OPERATION_REQUIRES_APPROVAL";
    if (!policy.reserveInitialized || !policy.vaultInitialized) {
      return "ACTIVE_OPERATION_REQUIRES_SYNCED_INFRASTRUCTURE";
    }
  }
  if (command === "enable-deposits" && policy.operationalStatus !== "ACTIVE") {
    return "DEPOSITS_REQUIRE_ACTIVE_OPERATIONAL_STATUS";
  }
  return null;
}

function requireGovernedAsset(snapshot, command) {
  if (!snapshot.assetEntry?.exists) throw new Error(`${command} requires an existing TCAP asset entry`);
  if (!snapshot.governancePolicy?.exists || !snapshot.extensionPolicy?.exists) {
    throw new Error(`${command} requires V2 governance and extension policy accounts; run migrate-legacy first`);
  }
}

function requireInfrastructure(snapshot, command) {
  requireGovernedAsset(snapshot, command);
  if (!snapshot.reserve?.exists || !snapshot.canonicalVault?.exists) {
    throw new Error(`${command} requires initialized reserve and canonical vault accounts`);
  }
}

export function buildGovernanceInstruction(commandValue, signerValue, snapshot, options = {}) {
  const command = normalizedCommand(commandValue);
  const signer = new PublicKey(signerValue);
  if (command === "raise-version-gate") {
    const accounts = [
      meta(signer, true, false, "governance"),
      meta(snapshot.config.address, false, true, "config"),
    ];
    return materializeInstruction(
      "raise_minimum_instruction_version_v2",
      accounts,
      anchorData("raise_minimum_instruction_version_v2"),
      {},
    );
  }
  const a = snapshot.addresses;
  if (command === "register") {
    if (snapshot.assetEntry?.exists) throw new Error("register cannot overwrite an existing asset entry");
    const policy = registrationPolicy(snapshot, options);
    const assetCommitment = parseHex32(options["asset-commitment"], "--asset-commitment");
    const governanceApproval = parseHex32(options["governance-approval"], "--governance-approval");
    const expectedMintAuthority = new PublicKey(snapshot.mint.mintAuthority ?? ZERO_PUBLIC_KEY);
    const expectedFreezeAuthority = new PublicKey(snapshot.mint.freezeAuthority ?? ZERO_PUBLIC_KEY);
    const data = anchorData("register_governed_asset_v2", [
      assetCommitment,
      governanceApproval,
      Buffer.from([snapshot.mint.decimals]),
      expectedMintAuthority.toBuffer(),
      expectedFreezeAuthority.toBuffer(),
      Buffer.from([policy.profile]),
      encodeU64(policy.requiredBitmap, "--required-extension-bitmap"),
      encodeU64(policy.allowedBitmap, "--allowed-extension-bitmap"),
    ]);
    return materializeInstruction("register_governed_asset_v2", [
      meta(signer, true, true, "registryAuthority"),
      meta(a.config, false, false, "config"),
      meta(a.registry, false, true, "registry"),
      meta(snapshot.mint.address, false, false, "mint"),
      meta(snapshot.mint.tokenProgram, false, false, "tokenProgram"),
      meta(a.assetEntry, false, true, "assetEntry"),
      meta(a.governancePolicy, false, true, "governancePolicy"),
      meta(a.extensionPolicy, false, true, "extensionPolicy"),
      meta(SystemProgram.programId, false, false, "systemProgram"),
    ], data, {
      assetCommitment: assetCommitment.toString("hex"),
      governanceApproval: governanceApproval.toString("hex"),
      expectedDecimals: snapshot.mint.decimals,
      expectedMintAuthority: expectedMintAuthority.toBase58(),
      expectedFreezeAuthority: expectedFreezeAuthority.toBase58(),
      mintProfile: policy.profileName,
      requiredExtensionBitmap: String(policy.requiredBitmap),
      allowedExtensionBitmap: String(policy.allowedBitmap),
    });
  }
  if (command === "migrate-legacy") {
    const policy = registrationPolicy(snapshot, options);
    const expectedMintAuthority = new PublicKey(snapshot.mint.mintAuthority ?? ZERO_PUBLIC_KEY);
    const expectedFreezeAuthority = new PublicKey(snapshot.mint.freezeAuthority ?? ZERO_PUBLIC_KEY);
    const data = anchorData("migrate_legacy_asset_policy_v2", [
      expectedMintAuthority.toBuffer(),
      expectedFreezeAuthority.toBuffer(),
      Buffer.from([policy.profile]),
      encodeU64(policy.requiredBitmap, "--required-extension-bitmap"),
      encodeU64(policy.allowedBitmap, "--allowed-extension-bitmap"),
    ]);
    return materializeInstruction("migrate_legacy_asset_policy_v2", [
      meta(signer, true, true, "governance"),
      meta(a.config, false, false, "config"),
      meta(a.registry, false, false, "registry"),
      meta(a.assetEntry, false, true, "assetEntry"),
      meta(snapshot.mint.address, false, false, "mint"),
      meta(snapshot.mint.tokenProgram, false, false, "tokenProgram"),
      meta(a.governancePolicy, false, true, "governancePolicy"),
      meta(a.extensionPolicy, false, true, "extensionPolicy"),
      meta(SystemProgram.programId, false, false, "systemProgram"),
    ], data, {
      expectedMintAuthority: expectedMintAuthority.toBase58(),
      expectedFreezeAuthority: expectedFreezeAuthority.toBase58(),
      mintProfile: policy.profileName,
      requiredExtensionBitmap: String(policy.requiredBitmap),
      allowedExtensionBitmap: String(policy.allowedBitmap),
    });
  }
  requireGovernedAsset(snapshot, command);
  const governAccounts = () => [
    meta(signer, true, false, "governance"),
    meta(a.config, false, false, "config"),
    meta(a.registry, false, false, "registry"),
    meta(a.assetEntry, false, true, "assetEntry"),
    meta(a.governancePolicy, false, true, "governancePolicy"),
  ];
  if (command === "approve" || command === "reject") {
    const status = command === "approve" ? APPROVAL_INPUT.approved : APPROVAL_INPUT.rejected;
    return materializeInstruction(
      "set_asset_approval_v2",
      governAccounts(),
      anchorData("set_asset_approval_v2", [Buffer.from([status])]),
      { status: APPROVAL_V2[status] },
    );
  }
  if (command === "disable-settlements") {
    return materializeInstruction(
      "set_asset_settlement_policy_v2",
      governAccounts(),
      anchorData("set_asset_settlement_policy_v2", [Buffer.from([0, 0, 0])]),
      { settlementsEnabled: false, publicExitEnabled: false, confidentialSettlementEnabled: false },
    );
  }
  if (command === "initialize-reserve") {
    return materializeInstruction("initialize_governed_reserve_v2", [
      meta(signer, true, true, "governance"),
      meta(a.config, false, false, "config"),
      meta(a.assetEntry, false, false, "assetEntry"),
      meta(a.governancePolicy, false, true, "governancePolicy"),
      meta(a.reserve, false, true, "reserveState"),
      meta(a.reserveAuthority, false, false, "reserveAuthority"),
      meta(a.canonicalVault, false, false, "futureVault"),
      meta(SystemProgram.programId, false, false, "systemProgram"),
    ], anchorData("initialize_governed_reserve_v2"), {});
  }
  if (command === "initialize-vault") {
    return materializeInstruction("initialize_governed_vault_v2", [
      meta(signer, true, true, "governance"),
      meta(a.config, false, false, "config"),
      meta(a.assetEntry, false, false, "assetEntry"),
      meta(a.governancePolicy, false, true, "governancePolicy"),
      meta(a.extensionPolicy, false, false, "extensionPolicy"),
      meta(a.reserve, false, true, "reserveState"),
      meta(snapshot.mint.address, false, false, "mint"),
      meta(a.reserveAuthority, false, false, "reserveAuthority"),
      meta(a.canonicalVault, false, true, "vault"),
      meta(snapshot.mint.tokenProgram, false, false, "tokenProgram"),
      meta(SystemProgram.programId, false, false, "systemProgram"),
    ], anchorData("initialize_governed_vault_v2"), {});
  }
  if (command === "sync-infrastructure") {
    requireInfrastructure(snapshot, command);
    return materializeInstruction("sync_governed_asset_infrastructure_v2", [
      meta(signer, true, false, "governance"),
      meta(a.config, false, false, "config"),
      meta(a.assetEntry, false, false, "assetEntry"),
      meta(a.governancePolicy, false, true, "governancePolicy"),
      meta(a.extensionPolicy, false, false, "extensionPolicy"),
      meta(a.reserve, false, false, "reserveState"),
      meta(snapshot.mint.address, false, false, "mint"),
      meta(a.canonicalVault, false, false, "vault"),
      meta(snapshot.mint.tokenProgram, false, false, "tokenProgram"),
    ], anchorData("sync_governed_asset_infrastructure_v2"), {});
  }
  requireInfrastructure(snapshot, command);
  const operationalAccounts = [
    meta(signer, true, false, "governance"),
    meta(a.config, false, false, "config"),
    meta(a.registry, false, false, "registry"),
    meta(a.assetEntry, false, true, "assetEntry"),
    meta(a.governancePolicy, false, true, "governancePolicy"),
    meta(a.extensionPolicy, false, false, "extensionPolicy"),
    meta(a.reserve, false, true, "reserveState"),
    meta(snapshot.mint.address, false, false, "mint"),
    meta(a.canonicalVault, false, false, "vault"),
    meta(snapshot.mint.tokenProgram, false, false, "tokenProgram"),
  ];
  if (command === "revoke-approval") {
    return materializeInstruction(
      "revoke_asset_approval_v2",
      operationalAccounts,
      anchorData("revoke_asset_approval_v2"),
      {},
    );
  }
  if (["activate", "deactivate", "pause", "resume", "deprecate"].includes(command)) {
    const targetName = {
      activate: "active",
      resume: "active",
      deactivate: "inactive",
      pause: "paused",
      deprecate: "deprecated",
    }[command];
    const status = OPERATIONAL_INPUT[targetName];
    return materializeInstruction(
      "set_asset_operational_status_v2",
      operationalAccounts,
      anchorData("set_asset_operational_status_v2", [Buffer.from([status])]),
      { status: OPERATIONAL_V2[status] },
    );
  }
  if (command === "enable-deposits" || command === "disable-deposits") {
    const enabled = command === "enable-deposits";
    const accounts = [
      meta(signer, true, false, "governance"),
      meta(a.config, false, false, "config"),
      meta(a.assetEntry, false, true, "assetEntry"),
      meta(a.governancePolicy, false, true, "governancePolicy"),
      meta(a.extensionPolicy, false, false, "extensionPolicy"),
      meta(a.reserve, false, true, "reserveState"),
      meta(snapshot.mint.address, false, false, "mint"),
      meta(a.canonicalVault, false, false, "vault"),
      meta(snapshot.mint.tokenProgram, false, false, "tokenProgram"),
    ];
    return materializeInstruction(
      "set_governed_deposit_policy_v2",
      accounts,
      anchorData("set_governed_deposit_policy_v2", [Buffer.from([Number(enabled)])]),
      { enabled },
    );
  }
  throw new Error(`Mutation command ${command} has no released transaction builder`);
}

function resolveKeypairPath(options) {
  const configured = options["governance-keypair"]
    ?? process.env.TCAP_GOVERNANCE_KEYPAIR
    ?? process.env.TCAP_GOVERNANCE_WALLET;
  if (!configured) {
    throw new Error(
      "Governance signer is not configured. Pass --governance-keypair <path> or set TCAP_GOVERNANCE_KEYPAIR/TCAP_GOVERNANCE_WALLET to a keypair path",
    );
  }
  try {
    new PublicKey(configured);
    throw new Error(
      "TCAP_GOVERNANCE_WALLET is a public address only; provide the matching secret keypair through TCAP_GOVERNANCE_KEYPAIR or --governance-keypair",
    );
  } catch (error) {
    if (String(error?.message).startsWith("TCAP_GOVERNANCE_WALLET is a public address")) throw error;
  }
  return configured.startsWith("~/")
    ? path.join(os.homedir(), configured.slice(2))
    : path.resolve(configured);
}

function loadGovernanceSigner(options) {
  const keypairPath = resolveKeypairPath(options);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  } catch {
    throw new Error("Governance keypair file could not be loaded or is not valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length !== 64 || parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error("Governance keypair file is not a valid 64-byte Solana keypair");
  }
  const secret = Uint8Array.from(parsed);
  parsed.fill(0);
  let signer;
  try {
    signer = Keypair.fromSecretKey(secret);
  } catch {
    secret.fill(0);
    throw new Error("Governance keypair file does not contain a valid Solana keypair");
  }
  // Keep the secret material alive until the mutation controller has signed
  // and serialized the transaction. Keypair.fromSecretKey may retain the
  // supplied backing array; clearing it here produces invalid signatures.
  const walletIdentity = process.env.TCAP_GOVERNANCE_WALLET;
  if (walletIdentity) {
    try {
      const expectedWallet = new PublicKey(walletIdentity).toBase58();
      if (expectedWallet !== signer.publicKey.toBase58()) {
        signer.secretKey.fill(0);
        throw new Error(`TCAP_GOVERNANCE_WALLET_MISMATCH: address ${expectedWallet} does not match supplied keypair ${signer.publicKey.toBase58()}`);
      }
    } catch (error) {
      if (String(error?.message).startsWith("TCAP_GOVERNANCE_WALLET_MISMATCH:")) throw error;
      // A non-public-key value is treated as a wallet/keypair path by the
      // resolver above; the keypair itself remains the source of identity.
    }
  }
  return {
    signer,
    sourceLabel: path.basename(keypairPath),
  };
}

function reserveBindingsCanonical(snapshot) {
  const reserve = snapshot?.reserve;
  const addresses = snapshot?.addresses;
  if (!addresses || !reserve || !["assetEntry", "canonicalVault", "reserveAuthority"].every((field) => field in reserve)) return true;
  return Boolean(
    reserve?.exists
    && addresses
    && reserve.assetEntry === addresses.assetEntry
    && reserve.canonicalVault === addresses.canonicalVault
    && reserve.reserveAuthority === addresses.reserveAuthority
  );
}

async function loadRootSnapshot(connection) {
  const [configAddress] = PublicKey.findProgramAddressSync([Buffer.from(SEEDS.config)], TCAP_PROGRAM_ID);
  const [registryAddress] = PublicKey.findProgramAddressSync([Buffer.from(SEEDS.registry)], TCAP_PROGRAM_ID);
  const [configInfo, registryInfo] = await connection.getMultipleAccountsInfo(
    [configAddress, registryAddress],
    "confirmed",
  );
  if (!configInfo?.owner.equals(TCAP_PROGRAM_ID)) throw new Error("TCAP global config was not found on Devnet");
  if (!registryInfo?.owner.equals(TCAP_PROGRAM_ID)) throw new Error("TCAP asset registry was not found on Devnet");
  return {
    config: { address: configAddress.toBase58(), ...decodeGlobalConfig(configInfo.data) },
    registry: { address: registryAddress.toBase58(), ...decodeRegistry(registryInfo.data) },
  };
}

function verifySignerAuthority(command, signer, snapshot) {
  const expected = snapshot.config.governanceAuthority;
  if (signer.publicKey.toBase58() !== expected) {
    throw new Error(`GOVERNANCE_AUTHORITY_MISMATCH: Config.governanceAuthority requires ${expected}; supplied ${signer.publicKey.toBase58()}`);
  }
  if (snapshot.config.registryAuthority !== expected) {
    throw new Error(`REGISTRY_AUTHORITY_MISMATCH: register requires Config.governanceAuthority ${expected}, but Config.registryAuthority is ${snapshot.config.registryAuthority}`);
  }
  return expected;
}

function safeSimulation(value) {
  const logs = value.logs ?? [];
  const programInvoked = logs.some((line) => line.includes(`Program ${TCAP_PROGRAM_ID.toBase58()} invoke`));
  const recognizedHandler = [...V2_LOG_NAMES].find(
    (name) => logs.some((line) => line.includes(`Instruction: ${name}`)),
  ) ?? null;
  return {
    evidenceClass: "DEVNET_SIMULATION_EVIDENCE",
    status: value.err === null ? "PASSED" : "FAILED",
    error: value.err,
    programInvoked,
    instructionHandlerRecognized: recognizedHandler !== null,
    recognizedHandler,
    logs,
    computeUnitsConsumed: value.unitsConsumed ?? null,
    confirmedStateChanges: "NONE",
  };
}

export function verifyMutationPostcondition(commandValue, state) {
  const command = normalizedCommand(commandValue);
  const conditions = [];
  const expect = (name, passed, observed) => conditions.push({
    name,
    status: passed ? "PASS" : "FAIL",
    observed,
  });
  if (command === "raise-version-gate") {
    expect("minimum instruction version is 2", state.config?.minimumInstructionVersion === 2, state.config?.minimumInstructionVersion ?? null);
  } else if (command === "register" || command === "migrate-legacy") {
    expect("asset entry exists", state.assetEntry?.exists === true, state.assetEntry?.exists ?? false);
    expect("governance policy exists", state.governancePolicy?.exists === true, state.governancePolicy?.exists ?? false);
    expect("extension policy exists", state.extensionPolicy?.exists === true, state.extensionPolicy?.exists ?? false);
  } else if (command === "approve") {
    expect("approval status is APPROVED", state.governancePolicy?.approvalStatus === "APPROVED", state.governancePolicy?.approvalStatus ?? null);
  } else if (command === "reject") {
    expect("approval status is REJECTED", state.governancePolicy?.approvalStatus === "REJECTED", state.governancePolicy?.approvalStatus ?? null);
  } else if (command === "revoke-approval") {
    expect("approval status is REVOKED", state.governancePolicy?.approvalStatus === "REVOKED", state.governancePolicy?.approvalStatus ?? null);
    expect("operational status is PAUSED", state.governancePolicy?.operationalStatus === "PAUSED", state.governancePolicy?.operationalStatus ?? null);
  } else if (["activate", "resume", "deactivate", "pause", "deprecate"].includes(command)) {
    const target = {
      activate: "ACTIVE",
      resume: "ACTIVE",
      deactivate: "INACTIVE",
      pause: "PAUSED",
      deprecate: "DEPRECATED",
    }[command];
    expect(`operational status is ${target}`, state.governancePolicy?.operationalStatus === target, state.governancePolicy?.operationalStatus ?? null);
    if (command === "deprecate") {
      expect("deprecation is irreversible", state.governancePolicy?.deprecatedIrreversible === true, state.governancePolicy?.deprecatedIrreversible ?? false);
    }
  } else if (command === "initialize-reserve") {
    expect("reserve account exists", state.reserve?.exists === true, state.reserve?.exists ?? false);
    expect("reserve initialized flag is true", state.governancePolicy?.reserveInitialized === true, state.governancePolicy?.reserveInitialized ?? false);
  } else if (command === "initialize-vault") {
    expect("canonical vault exists", state.canonicalVault?.exists === true, state.canonicalVault?.exists ?? false);
    expect("vault initialized flag is true", state.governancePolicy?.vaultInitialized === true, state.governancePolicy?.vaultInitialized ?? false);
  } else if (command === "sync-infrastructure") {
    expect("reserve initialized flag is true", state.governancePolicy?.reserveInitialized === true, state.governancePolicy?.reserveInitialized ?? false);
    expect("vault initialized flag is true", state.governancePolicy?.vaultInitialized === true, state.governancePolicy?.vaultInitialized ?? false);
  } else if (command === "enable-deposits" || command === "disable-deposits") {
    const enabled = command === "enable-deposits";
    expect(`governance deposits flag is ${enabled}`, state.governancePolicy?.depositsEnabled === enabled, state.governancePolicy?.depositsEnabled ?? null);
    expect(`asset-entry deposits flag is ${enabled}`, state.assetEntry?.depositsEnabled === enabled, state.assetEntry?.depositsEnabled ?? null);
    expect(`reserve funding flag is ${enabled}`, state.reserve?.fundingEnabled === enabled, state.reserve?.fundingEnabled ?? null);
    if (state.addresses && state.reserve && ["assetEntry", "canonicalVault", "reserveAuthority"].every((field) => field in state.reserve)) {
      expect("reserve binds canonical asset entry", state.reserve?.assetEntry === state.addresses.assetEntry, state.addresses.assetEntry, state.reserve?.assetEntry ?? null);
      expect("reserve binds canonical vault", state.reserve?.canonicalVault === state.addresses.canonicalVault, state.addresses.canonicalVault, state.reserve?.canonicalVault ?? null);
      expect("reserve binds canonical authority", state.reserve?.reserveAuthority === state.addresses.reserveAuthority, state.addresses.reserveAuthority, state.reserve?.reserveAuthority ?? null);
    }
  } else if (command === "disable-settlements") {
    expect("settlements disabled", state.governancePolicy?.settlementsEnabled === false, state.governancePolicy?.settlementsEnabled ?? null);
    expect("public exit disabled", state.governancePolicy?.publicExitEnabled === false, state.governancePolicy?.publicExitEnabled ?? null);
    expect("confidential settlement disabled", state.governancePolicy?.confidentialSettlementEnabled === false, state.governancePolicy?.confidentialSettlementEnabled ?? null);
  }
  return {
    status: conditions.length > 0 && conditions.every(({ status }) => status === "PASS") ? "PASS" : "FAIL",
    conditions,
  };
}

function sanitizeArtifact(value) {
  if (Array.isArray(value)) return value.map(sanitizeArtifact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeArtifact(child)]));
  }
  return typeof value === "string" ? sanitizeMessage(value) : value;
}

function writeMutationEvidence(command, artifact, options) {
  const root = options["evidence-dir"]
    ? path.resolve(options["evidence-dir"])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "protocol-test-runs", "tcap-asset-admin");
  fs.mkdirSync(root, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(root, `${stamp}-${command}.json`);
  fs.writeFileSync(target, `${JSON.stringify(sanitizeArtifact(artifact), null, 2)}\n`, { flag: "wx" });
  return target;
}

async function mutationController(commandValue, connection, options, positional) {
  const command = normalizedCommand(commandValue);
  if (command === "close") {
    const hasSelector = options.mint ?? options["asset-id"] ?? positional[0] ?? null;
    const selected = hasSelector ? await resolveAssetSelector(connection, options, positional) : null;
    const asset = selected ? await inspectAsset(connection, selected.mint, selected.tokenProgram) : null;
    return {
      command,
      status: "SAFE_CLOSURE_NOT_IMPLEMENTED_PRESERVE_DEPRECATED_TOMBSTONE",
      submitted: false,
      asset,
      reason: "TCAP has no audited asset-account closure or liability evacuation path. Deprecation must preserve public history and every reserve liability.",
    };
  }
  if (command === "enable-settlements") {
    return {
      command,
      status: "SETTLEMENT_NOT_IMPLEMENTED",
      submitted: false,
      reason: "The deployed/source V2 settlement policy deliberately rejects enabling settlement, public exit, or confidential settlement.",
    };
  }

  let snapshot;
  let mint = null;
  if (command === "raise-version-gate") {
    snapshot = await loadRootSnapshot(connection);
    if (snapshot.config.minimumInstructionVersion === 2) {
      return { command, status: "MINIMUM_INSTRUCTION_VERSION_ALREADY_2", idempotent: true, submitted: false };
    }
    if (snapshot.config.minimumInstructionVersion > 2) {
      return { command, status: "VERSION_GATE_ALREADY_ABOVE_SUPPORTED_V2", idempotent: true, submitted: false };
    }
  } else {
    const selected = await resolveAssetSelector(connection, options, positional, { register: command === "register" });
    mint = selected.mint;
    snapshot = await inspectAsset(connection, mint, selected.tokenProgram);
    if (snapshot.status === "MINT_NOT_FOUND") throw new Error("Mint account was not found on Devnet");
    const idempotent = evaluateMutationIdempotency(command, snapshot);
    if (idempotent) {
      return { command, status: idempotent, idempotent: true, submitted: false, asset: snapshot };
    }
    const blocked = validateMutationPrerequisites(command, snapshot);
    if (blocked) {
      return { command, status: "BLOCKED_PREREQUISITE", reason: blocked, submitted: false, asset: snapshot };
    }
  }

  const loaded = loadGovernanceSigner(options);
  const { signer } = loaded;
  try {
    const authority = verifySignerAuthority(command, signer, snapshot);
    const built = buildGovernanceInstruction(command, signer.publicKey, snapshot, options);
    const latest = await connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction({
      feePayer: signer.publicKey,
      recentBlockhash: latest.blockhash,
    }).add(built.instruction);
    const fee = await connection.getFeeForMessage(transaction.compileMessage(), "confirmed");
    const preview = {
      programId: TCAP_PROGRAM_ID.toBase58(),
      instruction: built.instructionName,
      discriminatorHex: built.instruction.data.subarray(0, 8).toString("hex"),
      instructionDataHex: built.instruction.data.toString("hex"),
      accounts: built.accountMetas,
      args: built.args,
      feePayer: signer.publicKey.toBase58(),
      authority,
      signerSource: loaded.sourceLabel,
      estimatedFeeLamports: fee.value,
      cluster: "devnet",
    };
    const simulationResponse = await connection.simulateTransaction(transaction);
    const simulation = safeSimulation(simulationResponse.value);
    const expectedHandler = anchorHandlerName(built.instructionName);
    let artifact = {
      schemaVersion: 1,
      command,
      createdAt: new Date().toISOString(),
      status: simulation.status === "PASSED" ? "SIMULATION_PASSED" : "SIMULATION_FAILED",
      submitted: false,
      confirmed: false,
      preview,
      simulation: { ...simulation, expectedHandler },
      preState: snapshot,
    };
    if (simulation.status !== "PASSED") {
      const evidencePath = writeMutationEvidence(command, artifact, options);
      return { ...artifact, evidencePath };
    }
    if (
      !simulation.programInvoked
      || !simulation.instructionHandlerRecognized
      || simulation.recognizedHandler !== expectedHandler
    ) {
      artifact.status = "SIMULATION_PASSED_HANDLER_NOT_PROVEN";
      artifact.submitted = false;
      artifact.reason = "The simulation did not provide both a TCAP invocation and the exact expected deployed Anchor handler log; submission remains fail-closed.";
      const evidencePath = writeMutationEvidence(command, artifact, options);
      return { ...artifact, evidencePath };
    }
    if (options.confirm !== true && options.confirm !== "true") {
      artifact.status = "SIMULATION_PASSED_WAITING_FOR_EXPLICIT_CONFIRMATION";
      artifact.requiredFlag = "--confirm";
      const evidencePath = writeMutationEvidence(command, artifact, options);
      return { ...artifact, evidencePath };
    }

    let signature;
    try {
      // Sign only after the final simulation. This prevents any mutation of
      // the transaction between signing and submission from producing a
      // remote "Invalid signature" error.
      transaction.sign(signer);
      if (!transaction.verifySignatures()) {
        throw new Error("LOCAL_SIGNATURE_VERIFICATION_FAILED");
      }
      const rawTransaction = transaction.serialize({
        requireAllSignatures: true,
        verifySignatures: true,
      });
      signature = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        maxRetries: 3,
      });
    } catch (error) {
      artifact = {
        ...artifact,
        status: "SUBMISSION_FAILED",
        submissionError: sanitizeMessage(error?.message),
      };
      const evidencePath = writeMutationEvidence(command, artifact, options);
      return { ...artifact, evidencePath };
    }
    artifact = { ...artifact, status: "SUBMITTED_CONFIRMING", submitted: true, signature };
    let confirmation;
    let confirmedTransaction;
    let postState;
    try {
      confirmation = await connection.confirmTransaction({
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }, "confirmed");
      confirmedTransaction = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      postState = mint
        ? await inspectAsset(connection, mint, snapshot.mint.tokenProgram)
        : await loadRootSnapshot(connection);
    } catch (error) {
      artifact = {
        ...artifact,
        status: "SUBMITTED_CONFIRMATION_UNAVAILABLE",
        evidenceClass: "SUBMITTED_DEVNET_EVIDENCE_CONFIRMATION_NOT_PROVEN",
        explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        confirmationError: sanitizeMessage(error?.message),
      };
      const evidencePath = writeMutationEvidence(command, artifact, options);
      return { ...artifact, evidencePath };
    }
    const postVerification = verifyMutationPostcondition(command, postState);
    artifact = {
      ...artifact,
      status: confirmation.value.err === null && postVerification.status === "PASS"
        ? "CONFIRMED_AND_VERIFIED"
        : confirmation.value.err === null
          ? "CONFIRMED_POST_VERIFICATION_FAILED"
          : "CONFIRMED_WITH_ERROR",
      confirmed: confirmation.value.err === null,
      evidenceClass: "CONFIRMED_DEVNET_EVIDENCE",
      explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      confirmationError: confirmation.value.err,
      transaction: {
        slot: confirmedTransaction?.slot ?? null,
        blockTime: confirmedTransaction?.blockTime ?? null,
        feeLamports: confirmedTransaction?.meta?.fee ?? null,
        error: confirmedTransaction?.meta?.err ?? confirmation.value.err,
        computeUnitsConsumed: confirmedTransaction?.meta?.computeUnitsConsumed ?? null,
        logs: confirmedTransaction?.meta?.logMessages ?? [],
      },
      postState,
      postVerification,
    };
    const evidencePath = writeMutationEvidence(command, artifact, options);
    return { ...artifact, evidencePath };
  } finally {
    signer.secretKey.fill(0);
  }
}

function usage() {
  return {
    name: "TCAP governed asset administration",
    usage: "npm run tcap:asset-admin -- <command> [options]",
    readOnlyCommands: {
      list: "Discover and decode TCAP asset-entry accounts directly from Devnet.",
      inspect: "inspect (--mint <address> | --asset-id <asset-entry PDA>) [--token-program <address>]",
      verify: "verify (--mint <address> | --asset-id <asset-entry PDA>) [--operation deposits|settlement|identity]",
    },
    governedMutationCommands: [...MUTATION_COMMANDS],
    mutationSafety: "Every mutation loads live Devnet state, applies idempotency guards, builds a preview, simulates, and writes sanitized evidence. Submission occurs only with an explicit governance keypair and --confirm.",
    governanceSigner: "Pass --governance-keypair <path>, set TCAP_GOVERNANCE_KEYPAIR, or set TCAP_GOVERNANCE_WALLET to a keypair path plus optional public address identity. Secret bytes are never printed or serialized.",
    settlementSafety: "Settlement enabling and account closure remain deliberately unavailable.",
    workflow: {
      previewAndSimulate: "Run a mutation without --confirm. Review the preview, simulation logs, and saved evidence path.",
      submit: "Repeat the same command with --confirm only after the simulation passes.",
      register: "register --mint <address> --mint-profile <standard-public|confidential-transfer-enabled> --asset-commitment <64hex> --governance-approval <64hex>",
      migrate: "migrate-legacy --mint <address> [--mint-profile <profile>]",
      lifecycle: "approve | reject | initialize-reserve | initialize-vault | sync-infrastructure | activate | pause | resume | deactivate | enable-deposits | disable-deposits | revoke-approval | deprecate",
      versionGate: "raise-version-gate (irreversibly disables V1 instructions once confirmed)",
    },
    evidenceRule: "Live acceptance is derived from Devnet accounts only. Local IDLs and local asset labels are not deployed evidence.",
  };
}

export async function run(argv = process.argv.slice(2)) {
  const { command, options, positional } = parseArgs(argv);
  if (["help", "--help", "-h"].includes(command)) return usage();
  const connection = new Connection(resolveRpc(options), "confirmed");
  if (command === "list") return listAssets(connection);
  if (command === "inspect") {
    const selected = await resolveAssetSelector(connection, options, positional);
    return { command, ...(await inspectAsset(connection, selected.mint, selected.tokenProgram)) };
  }
  if (command === "verify") return verifyAssets(connection, options, positional);
  if (MUTATION_COMMANDS.has(command)) return mutationController(command, connection, options, positional);
  return { ...usage(), status: "UNKNOWN_COMMAND", command };
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedAsScript) {
  try {
    const output = await run();
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (String(output.status).startsWith("BLOCKED_") || output.status === "UNKNOWN_COMMAND") {
      process.exitCode = 2;
    }
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      status: "ASSET_ADMIN_ERROR",
      submitted: false,
      message: sanitizeMessage(error?.message),
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
