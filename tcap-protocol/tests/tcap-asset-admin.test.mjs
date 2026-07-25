import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  SPL_TOKEN_PROGRAM_ID,
  anchorHandlerName,
  buildGovernanceInstruction,
  decodeAssetEntry,
  decodeFundingClaim,
  decodeGovernancePolicy,
  decodeReserve,
  deriveAssetAddresses,
  evaluateMutationIdempotency,
  liveAcceptanceReason,
  run,
  sanitizeMessage,
  validateMutationPrerequisites,
  verifyMutationPostcondition,
} from "../scripts/tcap-asset-admin.mjs";
import { createHash } from "node:crypto";

const discriminator = (name) => createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
const instructionDiscriminator = (name) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
const key = (byte) => new PublicKey(Uint8Array.from({ length: 32 }, () => byte));

test("derives stable canonical asset and policy PDAs", () => {
  const mint = key(7);
  const first = deriveAssetAddresses(mint, SPL_TOKEN_PROGRAM_ID);
  const second = deriveAssetAddresses(mint, SPL_TOKEN_PROGRAM_ID);
  assert.deepEqual(first, second);
  assert.notEqual(first.assetEntry, first.governancePolicy);
  assert.notEqual(first.assetEntry, first.extensionPolicy);
  assert.notEqual(first.reserve, first.canonicalVault);
});

test("decodes V1 asset and reserve liabilities without unsafe numbers", () => {
  const entry = Buffer.alloc(283);
  discriminator("TcapAssetEntryV1").copy(entry);
  key(1).toBuffer().copy(entry, 12);
  SPL_TOKEN_PROGRAM_ID.toBuffer().copy(entry, 44);
  key(2).toBuffer().copy(entry, 76);
  key(3).toBuffer().copy(entry, 144);
  key(4).toBuffer().copy(entry, 176);
  key(5).toBuffer().copy(entry, 208);
  entry.writeUInt8(6, 240);
  entry.writeUInt8(1, 241);
  entry.writeUInt8(1, 279);
  entry.writeUInt8(1, 280);
  assert.equal(decodeAssetEntry(entry).depositsEnabled, true);
  assert.equal(decodeAssetEntry(entry).operationalStatusV1, "ACTIVE");

  const reserve = Buffer.alloc(161);
  discriminator("TcapReserveStateV1").copy(reserve);
  reserve.writeBigUInt64LE(10_000_000_000_000_000n, 108);
  reserve.writeBigUInt64LE(9_000_000_000_000_000n, 116);
  reserve.writeBigUInt64LE(1_000_000_000_000_000n, 124);
  assert.equal(decodeReserve(reserve).actualAssets, "10000000000000000");
  assert.equal(decodeReserve(reserve).totalLiabilities, "10000000000000000");
});

test("decodes independent governance approval and operational status", () => {
  const policy = Buffer.alloc(222);
  discriminator("TcapAssetGovernancePolicyV2").copy(policy);
  policy.writeUInt8(1, 140);
  policy.writeUInt8(2, 141);
  const decoded = decodeGovernancePolicy(policy);
  assert.equal(decoded.approvalStatus, "APPROVED");
  assert.equal(decoded.operationalStatus, "PAUSED");
});

test("decodes live FundingClaim references at the canonical asset offset", () => {
  const claim = Buffer.alloc(335);
  discriminator("FundingClaimV1").copy(claim);
  key(3).toBuffer().copy(claim, 44);
  claim.writeBigUInt64LE(1250n, 172);
  claim.writeUInt8(1, 180);
  const decoded = decodeFundingClaim(claim);
  assert.equal(decoded.assetEntry, key(3).toBase58());
  assert.equal(decoded.amount, "1250");
  assert.equal(decoded.settlementMode, "PUBLIC_WALLET");
  assert.equal(decoded.status, "PENDING");
});

const governedSnapshot = () => {
  const mint = key(7);
  const addresses = deriveAssetAddresses(mint, SPL_TOKEN_PROGRAM_ID);
  return {
    addresses,
    config: {
      address: addresses.config,
      governanceAuthority: key(9).toBase58(),
      registryAuthority: key(9).toBase58(),
      minimumInstructionVersion: 1,
    },
    registry: { address: addresses.registry },
    mint: {
      address: mint.toBase58(),
      tokenProgram: SPL_TOKEN_PROGRAM_ID.toBase58(),
      decimals: 6,
      mintAuthority: key(8).toBase58(),
      freezeAuthority: null,
    },
    assetEntry: { exists: true, depositsEnabled: false },
    governancePolicy: {
      exists: true,
      approvalStatus: "PENDING",
      operationalStatus: "INACTIVE",
      depositsEnabled: false,
      settlementsEnabled: false,
      publicExitEnabled: false,
      confidentialSettlementEnabled: false,
      reserveInitialized: true,
      vaultInitialized: true,
    },
    extensionPolicy: { exists: true },
    reserve: { exists: true },
    canonicalVault: { exists: true },
  };
};

test("approval builder uses canonical discriminator, data and account order", () => {
  const snapshot = governedSnapshot();
  const built = buildGovernanceInstruction("approve", snapshot.config.governanceAuthority, snapshot);
  assert.equal(built.instructionName, "set_asset_approval_v2");
  assert.equal(built.instruction.data.length, 9);
  assert.equal(
    built.instruction.data.subarray(0, 8).toString("hex"),
    instructionDiscriminator("set_asset_approval_v2").toString("hex"),
  );
  assert.equal(built.instruction.data.readUInt8(8), 1);
  assert.deepEqual(built.accountMetas.map(({ role }) => role), [
    "governance",
    "config",
    "registry",
    "assetEntry",
    "governancePolicy",
  ]);
  assert.equal(built.accountMetas[0].signer, true);
  assert.equal(built.accountMetas[3].writable, true);
});

test("simulation submission guard expects the exact Anchor handler name", () => {
  assert.equal(
    anchorHandlerName("set_asset_operational_status_v2"),
    "SetAssetOperationalStatusV2",
  );
  assert.notEqual(
    anchorHandlerName("set_asset_operational_status_v2"),
    "SetAssetApprovalV2",
  );
});

test("register builder encodes complete V2 arguments and init account metas", () => {
  const snapshot = governedSnapshot();
  snapshot.assetEntry = { exists: false };
  snapshot.governancePolicy = { exists: false };
  snapshot.extensionPolicy = { exists: false };
  snapshot.reserve = { exists: false };
  snapshot.canonicalVault = { exists: false };
  const built = buildGovernanceInstruction(
    "register",
    snapshot.config.registryAuthority,
    snapshot,
    {
      "asset-commitment": "11".repeat(32),
      "governance-approval": "22".repeat(32),
      "mint-profile": "standard-public",
    },
  );
  assert.equal(built.instructionName, "register_governed_asset_v2");
  assert.equal(built.instruction.data.length, 154);
  assert.deepEqual(built.accountMetas.map(({ role }) => role), [
    "registryAuthority",
    "config",
    "registry",
    "mint",
    "tokenProgram",
    "assetEntry",
    "governancePolicy",
    "extensionPolicy",
    "systemProgram",
  ]);
  assert.equal(built.args.expectedDecimals, 6);
  assert.equal(built.args.requiredExtensionBitmap, "0");
  assert.equal(built.args.allowedExtensionBitmap, "0");
});

test("vault builder matches Anchor account-meta order", () => {
  const snapshot = governedSnapshot();
  snapshot.canonicalVault.exists = false;
  snapshot.governancePolicy.vaultInitialized = false;
  const built = buildGovernanceInstruction(
    "initialize-vault",
    snapshot.config.governanceAuthority,
    snapshot,
  );
  assert.deepEqual(built.accountMetas.map(({ role }) => role), [
    "governance",
    "config",
    "assetEntry",
    "governancePolicy",
    "extensionPolicy",
    "reserveState",
    "mint",
    "reserveAuthority",
    "vault",
    "tokenProgram",
    "systemProgram",
  ]);
  assert.equal(built.accountMetas[8].writable, true);
});

test("all released lifecycle builders use the expected Anchor instruction", () => {
  const snapshot = governedSnapshot();
  const signer = snapshot.config.governanceAuthority;
  const expectations = new Map([
    ["reject", "set_asset_approval_v2"],
    ["revoke-approval", "revoke_asset_approval_v2"],
    ["activate", "set_asset_operational_status_v2"],
    ["deactivate", "set_asset_operational_status_v2"],
    ["pause", "set_asset_operational_status_v2"],
    ["resume", "set_asset_operational_status_v2"],
    ["deprecate", "set_asset_operational_status_v2"],
    ["initialize-reserve", "initialize_governed_reserve_v2"],
    ["sync-infrastructure", "sync_governed_asset_infrastructure_v2"],
    ["enable-deposits", "set_governed_deposit_policy_v2"],
    ["disable-deposits", "set_governed_deposit_policy_v2"],
    ["disable-settlements", "set_asset_settlement_policy_v2"],
  ]);
  for (const [command, instructionName] of expectations) {
    const built = buildGovernanceInstruction(command, signer, snapshot);
    assert.equal(built.instructionName, instructionName, command);
    assert.equal(
      built.instruction.data.subarray(0, 8).toString("hex"),
      instructionDiscriminator(instructionName).toString("hex"),
      command,
    );
  }

  const legacy = governedSnapshot();
  legacy.governancePolicy = { exists: false };
  legacy.extensionPolicy = { exists: false };
  const migrate = buildGovernanceInstruction("migrate-legacy", signer, legacy);
  assert.equal(migrate.instructionName, "migrate_legacy_asset_policy_v2");
  assert.equal(migrate.instruction.data.length, 89);

  const root = buildGovernanceInstruction("raise-version-gate", signer, {
    config: { address: snapshot.addresses.config },
  });
  assert.equal(root.instructionName, "raise_minimum_instruction_version_v2");
  assert.equal(root.instruction.data.length, 8);
});

test("idempotency guards prevent duplicate lifecycle operations", () => {
  const snapshot = governedSnapshot();
  snapshot.governancePolicy.approvalStatus = "APPROVED";
  snapshot.governancePolicy.operationalStatus = "ACTIVE";
  snapshot.governancePolicy.depositsEnabled = true;
  snapshot.assetEntry.depositsEnabled = true;
  assert.equal(evaluateMutationIdempotency("approve", snapshot), "ALREADY_APPROVED");
  assert.equal(evaluateMutationIdempotency("activate", snapshot), "ALREADY_ACTIVE");
  assert.equal(evaluateMutationIdempotency("enable-deposits", snapshot), "DEPOSITS_ALREADY_ENABLED");
  assert.equal(evaluateMutationIdempotency("initialize-reserve", snapshot), "RESERVE_ALREADY_INITIALIZED");
  assert.equal(evaluateMutationIdempotency("sync-infrastructure", snapshot), "INFRASTRUCTURE_ALREADY_SYNCED");
});

test("live-state prerequisite guards stop unsafe lifecycle ordering", () => {
  const snapshot = governedSnapshot();
  assert.equal(
    validateMutationPrerequisites("initialize-reserve", snapshot),
    "RESERVE_INITIALIZATION_REQUIRES_APPROVAL",
  );
  assert.equal(
    validateMutationPrerequisites("enable-deposits", snapshot),
    "ACTIVE_OPERATION_REQUIRES_APPROVAL",
  );
  snapshot.governancePolicy.approvalStatus = "APPROVED";
  snapshot.governancePolicy.operationalStatus = "ACTIVE";
  assert.equal(validateMutationPrerequisites("enable-deposits", snapshot), null);
});

test("confirmed mutations require explicit post-state verification", () => {
  const snapshot = governedSnapshot();
  snapshot.governancePolicy.approvalStatus = "APPROVED";
  assert.equal(verifyMutationPostcondition("approve", snapshot).status, "PASS");
  snapshot.governancePolicy.depositsEnabled = true;
  snapshot.assetEntry.depositsEnabled = true;
  snapshot.reserve.fundingEnabled = true;
  assert.equal(verifyMutationPostcondition("enable-deposits", snapshot).status, "PASS");
  snapshot.reserve.fundingEnabled = false;
  assert.equal(verifyMutationPostcondition("enable-deposits", snapshot).status, "FAIL");
});

test("live verification returns one precise acceptance reason", () => {
  const snapshot = governedSnapshot();
  snapshot.assetEntry.ownerMatches = true;
  snapshot.governancePolicy.ownerMatches = true;
  snapshot.extensionPolicy.ownerMatches = true;
  snapshot.governancePolicy.approvalStatus = "APPROVED";
  snapshot.governancePolicy.operationalStatus = "ACTIVE";
  snapshot.governancePolicy.depositsEnabled = true;
  snapshot.assetEntry.depositsEnabled = true;
  snapshot.reserve.fundingEnabled = true;
  snapshot.reserve.paused = false;
  snapshot.checks = [];
  assert.equal(liveAcceptanceReason(snapshot, "deposits"), "ACCEPTED");
  snapshot.governancePolicy.depositsEnabled = false;
  assert.equal(liveAcceptanceReason(snapshot, "deposits"), "DEPOSITS_DISABLED");
  snapshot.governancePolicy.approvalStatus = "REJECTED";
  assert.equal(liveAcceptanceReason(snapshot, "deposits"), "REJECTED");
});

test("settlement enabling is fail-closed without an RPC or signer", async () => {
  const output = await run(["enable-settlements"]);
  assert.equal(output.status, "SETTLEMENT_NOT_IMPLEMENTED");
  assert.equal(output.submitted, false);
});

test("close is permanently fail-closed and preserves the tombstone", async () => {
  const output = await run(["close"]);
  assert.equal(output.status, "SAFE_CLOSURE_NOT_IMPLEMENTED_PRESERVE_DEPRECATED_TOMBSTONE");
  assert.equal(output.submitted, false);
});

test("RPC credentials are redacted from failures", () => {
  assert.equal(
    sanitizeMessage("request https://example.invalid/?api-key=super-secret failed"),
    "request https://example.invalid/?api-key=[REDACTED] failed",
  );
});
