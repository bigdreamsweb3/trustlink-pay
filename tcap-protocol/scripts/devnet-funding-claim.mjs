import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const RPC = process.env.TCAP_RPC_URL ?? "https://api.devnet.solana.com";
const MINT = new PublicKey(process.env.TCAP_TEST_MINT ?? "9ZqZ4fLxzSedkoZfUFYVXrbezNUbf41KxU9N5i6R92PK");
const SOURCE = new PublicKey(process.env.TCAP_TEST_SOURCE ?? "563tkShWJf3VKttQTeUEAAdfkUfzX2DrZztQVSHDunPy");
const DEPOSIT_AMOUNT = BigInt(process.env.TCAP_TEST_AMOUNT ?? "100");
const REQUIRE_CLEAN_FIXTURE = process.env.TCAP_REQUIRE_CLEAN === "1";
const walletPath = process.env.SOLANA_WALLET ?? `${os.homedir()}/.config/solana/id.json`;
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
const connection = new Connection(RPC, "confirmed");
const seed = (value) => Buffer.from(value, "utf8");
const hash = (parts) => createHash("sha256").update(Buffer.concat(parts.map((part) => Buffer.from(part)))).digest();
const discriminator = (namespace, name) => hash([Buffer.from(`${namespace}:${name}`)]).subarray(0, 8);
const u16 = (value) => { const out = Buffer.alloc(2); out.writeUInt16LE(value); return out; };
const u32 = (value) => { const out = Buffer.alloc(4); out.writeUInt32LE(value); return out; };
const u64 = (value) => { const out = Buffer.alloc(8); out.writeBigUInt64LE(BigInt(value)); return out; };

const [config] = PublicKey.findProgramAddressSync([seed("tcap:global-config:v1")], PROGRAM_ID);
const [registry] = PublicKey.findProgramAddressSync([seed("tcap:asset-registry:v1")], PROGRAM_ID);
const [assetEntry] = PublicKey.findProgramAddressSync(
  [seed("tcap:asset-entry:v1"), registry.toBytes(), TOKEN_PROGRAM_ID.toBytes(), MINT.toBytes()],
  PROGRAM_ID,
);
const [reserveState] = PublicKey.findProgramAddressSync([seed("tcap:reserve-state:v1"), assetEntry.toBytes()], PROGRAM_ID);
const [vault] = PublicKey.findProgramAddressSync([seed("tcap:future-vault:v1"), assetEntry.toBytes()], PROGRAM_ID);
const [fundingRoot] = PublicKey.findProgramAddressSync([seed("tcap:funding-root:v1"), assetEntry.toBytes()], PROGRAM_ID);
const [fundingNonce] = PublicKey.findProgramAddressSync(
  [seed("tcap:funding-nonce:v1"), assetEntry.toBytes(), payer.publicKey.toBytes()],
  PROGRAM_ID,
);

function decodeConfig(data) {
  // Anchor discriminator (8), version/protocol/minimum u16s, five authority
  // Pubkeys, two boolean flags, then registry/root Pubkeys. domain_version is
  // therefore at byte 240 in TcapGlobalConfigV1.
  return { protocolVersion: data.readUInt16LE(10), domainVersion: data.readUInt16LE(240) };
}

function decodeAsset(data) {
  return {
    tokenProgram: new PublicKey(data.subarray(44, 76)),
    mint: new PublicKey(data.subarray(76, 108)),
    registryVersion: data.readUInt32LE(108),
    assetCommitment: data.subarray(112, 144),
  };
}

function decodeReserve(data) {
  return {
    actualAssets: data.readBigUInt64LE(108),
    pendingLiabilities: data.readBigUInt64LE(116),
    confidentialLiabilities: data.readBigUInt64LE(124),
    authorizedWithdrawalLiabilities: data.readBigUInt64LE(132),
    reservedRefundLiabilities: data.readBigUInt64LE(140),
  };
}

function decodeRoot(data) {
  return {
    currentRoot: data.subarray(44, 76).toString("hex"),
    previousRoot: data.subarray(76, 108).toString("hex"),
    sequence: data.readBigUInt64LE(108),
  };
}

function decodeNonce(data) {
  return {
    nextNonce: data.readBigUInt64LE(74),
    lastFundingClaim: new PublicKey(data.subarray(82, 114)).toBase58(),
  };
}

function decodeClaim(data) {
  return {
    fundingIdentifier: data.subarray(108, 140).toString("hex"),
    fundingCommitment: data.subarray(140, 172).toString("hex"),
    amount: data.readBigUInt64LE(172),
    settlementMode: data[180],
    destinationCommitment: data.subarray(181, 213).toString("hex"),
    authorizationCommitment: data.subarray(213, 245).toString("hex"),
    authorizationNonce: data.readBigUInt64LE(245),
    expiresAtSlot: data.readBigUInt64LE(253),
    feeAuthorizationCommitment: data.subarray(261, 293).toString("hex"),
    fundingRootSequence: data.readBigUInt64LE(325),
    status: data[333],
  };
}

async function snapshot() {
  const [sourceBalance, vaultBalance, reserve, root, nonce] = await Promise.all([
    connection.getTokenAccountBalance(SOURCE),
    connection.getTokenAccountBalance(vault),
    connection.getAccountInfo(reserveState),
    connection.getAccountInfo(fundingRoot),
    connection.getAccountInfo(fundingNonce),
  ]);
  assert.ok(reserve, "reserve must exist");
  return {
    source: BigInt(sourceBalance.value.amount),
    vault: BigInt(vaultBalance.value.amount),
    reserve: decodeReserve(reserve.data),
    root: root ? decodeRoot(root.data) : null,
    nonce: nonce ? decodeNonce(nonce.data) : null,
  };
}

function buildInstruction({
  amount,
  fundingIdentifier,
  nonce,
  expiry,
  destination,
  fee,
  salt,
  configState,
  assetState,
  settlementMode = 0,
  authorizationOverride,
  accountOverrides = {},
}) {
  const domain = hash([
    seed("tcap:funding-domain:v1"),
    PROGRAM_ID.toBytes(),
    u16(configState.protocolVersion),
    u16(configState.domainVersion),
    assetState.assetCommitment,
  ]);
  const canonicalAuthorization = hash([
    seed("tcap:funding-auth:v1"),
    PROGRAM_ID.toBytes(),
    u16(configState.protocolVersion),
    payer.publicKey.toBytes(),
    fundingIdentifier,
    u64(nonce),
    u64(expiry),
  ]);
  const authorization = authorizationOverride ?? canonicalAuthorization;
  const commitment = hash([
    seed("TCAP_FUNDING_CLAIM_V1"),
    PROGRAM_ID.toBytes(),
    u16(configState.protocolVersion),
    registry.toBytes(),
    reserveState.toBytes(),
    assetState.tokenProgram.toBytes(),
    assetState.mint.toBytes(),
    u32(assetState.registryVersion),
    assetState.assetCommitment,
    u64(amount),
    Buffer.from([settlementMode]),
    destination,
    authorization,
    fundingIdentifier,
    u64(nonce),
    u64(expiry),
    fee,
    salt,
    domain,
  ]);
  const [fundingClaim] = PublicKey.findProgramAddressSync(
    [seed("tcap:funding-claim:v1"), assetEntry.toBytes(), fundingIdentifier],
    PROGRAM_ID,
  );
  const data = Buffer.concat([
    discriminator("global", "deposit_with_funding_commitment_v1"),
    u64(amount),
    Buffer.from([settlementMode]),
    destination,
    fundingIdentifier,
    u64(nonce),
    u64(expiry),
    fee,
    salt,
    domain,
    commitment,
  ]);
  const accounts = {
    config,
    registry,
    assetEntry,
    reserveState,
    fundingRoot,
    fundingNonce,
    source: SOURCE,
    vault,
    mint: MINT,
    tokenProgram: TOKEN_PROGRAM_ID,
    ...accountOverrides,
  };
  return {
    fundingClaim,
    commitment,
    instruction: new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: accounts.config, isSigner: false, isWritable: false },
        { pubkey: accounts.registry, isSigner: false, isWritable: false },
        { pubkey: accounts.assetEntry, isSigner: false, isWritable: false },
        { pubkey: accounts.reserveState, isSigner: false, isWritable: true },
        { pubkey: accounts.fundingRoot, isSigner: false, isWritable: true },
        { pubkey: fundingClaim, isSigner: false, isWritable: true },
        { pubkey: accounts.fundingNonce, isSigner: false, isWritable: true },
        { pubkey: accounts.source, isSigner: false, isWritable: true },
        { pubkey: accounts.vault, isSigner: false, isWritable: true },
        { pubkey: accounts.mint, isSigner: false, isWritable: false },
        { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }),
  };
}

async function send(instruction) {
  return sendAndConfirmTransaction(connection, new Transaction().add(instruction), [payer], {
    commitment: "confirmed",
  });
}

function assertStateUnchanged(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label}: all token and TCAP state must roll back`);
}

const rejectionResults = [];
async function expectRollback(label, built, baseline, { claimMustBeAbsent = true } = {}) {
  let errorMessage = "";
  try {
    await send(built.instruction);
    assert.fail(`${label}: transaction unexpectedly succeeded`);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message.split("\n")[0] : String(error);
  }
  const afterFailure = await snapshot();
  assertStateUnchanged(afterFailure, baseline, label);
  const claimInfo = await connection.getAccountInfo(built.fundingClaim);
  if (claimMustBeAbsent) {
    assert.equal(claimInfo, null, `${label}: failed Funding Claim must be absent`);
  } else {
    assert.ok(claimInfo, `${label}: original Funding Claim must remain present`);
  }
  rejectionResults.push({ label, rejected: true, fullRollback: true, error: errorMessage });
}

const [configInfo, assetInfo] = await Promise.all([
  connection.getAccountInfo(config),
  connection.getAccountInfo(assetEntry),
]);
assert.ok(configInfo && assetInfo, "TCAP config and asset must exist");
const configState = decodeConfig(configInfo.data);
const assetState = decodeAsset(assetInfo.data);
const before = await snapshot();
assert.equal(before.reserve.actualAssets, before.vault, "precondition: reserve actual_assets equals vault balance");
assert.ok(before.reserve.actualAssets >= before.reserve.pendingLiabilities, "precondition: reserve covers pending liabilities");
if (REQUIRE_CLEAN_FIXTURE) {
  assert.equal(before.source, 100000n, "clean fixture source must contain exactly 1000.00 tokens");
  assert.equal(before.vault, 0n, "clean fixture vault must start empty");
  assert.equal(before.reserve.actualAssets, 0n);
  assert.equal(before.reserve.pendingLiabilities, 0n);
  assert.equal(before.reserve.confidentialLiabilities, 0n);
  assert.equal(before.root, null, "clean fixture funding root account must not yet exist");
  assert.equal(before.nonce, null, "clean fixture nonce account must not yet exist");
}

const nonce = before.nonce?.nextNonce ?? 0n;
const expiry = BigInt((await connection.getSlot("confirmed")) + 150);
const fundingIdentifier = randomBytes(32);
const successful = buildInstruction({
  amount: DEPOSIT_AMOUNT,
  fundingIdentifier,
  nonce,
  expiry,
  destination: randomBytes(32),
  fee: randomBytes(32),
  salt: randomBytes(32),
  configState,
  assetState,
});
const signature = await send(successful.instruction);
const after = await snapshot();
const claimInfo = await connection.getAccountInfo(successful.fundingClaim);
assert.ok(claimInfo, "funding claim must exist");
const claim = decodeClaim(claimInfo.data);
const emptyRoot = hash([
  seed("tcap:funding-empty-root:v1"),
  PROGRAM_ID.toBytes(),
  hash([
    seed("tcap:funding-domain:v1"),
    PROGRAM_ID.toBytes(),
    u16(configState.protocolVersion),
    u16(configState.domainVersion),
    assetState.assetCommitment,
  ]),
  assetEntry.toBytes(),
]).toString("hex");

assert.equal(after.source, before.source - DEPOSIT_AMOUNT);
assert.equal(after.vault, before.vault + DEPOSIT_AMOUNT);
assert.equal(after.reserve.actualAssets, before.reserve.actualAssets + DEPOSIT_AMOUNT);
assert.equal(after.reserve.pendingLiabilities, before.reserve.pendingLiabilities + DEPOSIT_AMOUNT);
assert.equal(after.reserve.confidentialLiabilities, before.reserve.confidentialLiabilities);
assert.equal(after.reserve.authorizedWithdrawalLiabilities, before.reserve.authorizedWithdrawalLiabilities);
assert.equal(after.reserve.reservedRefundLiabilities, before.reserve.reservedRefundLiabilities);
assert.equal(after.reserve.actualAssets, after.vault);
assert.ok(after.reserve.actualAssets >= after.reserve.pendingLiabilities);
assert.equal(after.root.sequence, (before.root?.sequence ?? 0n) + 1n);
assert.equal(after.root.previousRoot, before.root?.currentRoot ?? emptyRoot);
assert.notEqual(after.root.currentRoot, after.root.previousRoot);
assert.equal(after.nonce.nextNonce, nonce + 1n);
assert.equal(claim.fundingCommitment, successful.commitment.toString("hex"));
assert.equal(claim.amount, DEPOSIT_AMOUNT);
assert.equal(claim.status, 0);

const nextNonce = after.nonce.nextNonce;
const futureExpiry = BigInt((await connection.getSlot("confirmed")) + 150);
const validCase = (overrides = {}) => buildInstruction({
  amount: DEPOSIT_AMOUNT,
  fundingIdentifier: randomBytes(32),
  nonce: nextNonce,
  expiry: futureExpiry,
  destination: randomBytes(32),
  fee: randomBytes(32),
  salt: randomBytes(32),
  configState,
  assetState,
  ...overrides,
});

await expectRollback("wrong registry", validCase({ accountOverrides: { registry: config } }), after);
await expectRollback("wrong reserve", validCase({ accountOverrides: { reserveState: config } }), after);
await expectRollback("wrong vault", validCase({ accountOverrides: { vault: SOURCE } }), after);
await expectRollback("wrong token program", validCase({ accountOverrides: { tokenProgram: SystemProgram.programId } }), after);
await expectRollback("wrong mint", validCase({ accountOverrides: { mint: SOURCE } }), after);
await expectRollback("stale nonce", validCase({ nonce }), after);
await expectRollback("skipped nonce", validCase({ nonce: nextNonce + 1n }), after);
await expectRollback("duplicate funding identifier", successful, after, { claimMustBeAbsent: false });
await expectRollback("expired authorization", validCase({ expiry: BigInt((await connection.getSlot("confirmed")) - 1) }), after);
await expectRollback("invalid settlement mode", validCase({ settlementMode: 2 }), after);

const destinationMutation = validCase();
destinationMutation.instruction.data[17] ^= 1;
await expectRollback("mutated destination commitment", destinationMutation, after);

const feeMutation = validCase();
feeMutation.instruction.data[97] ^= 1;
await expectRollback("mutated fee commitment", feeMutation, after);

await expectRollback(
  "mutated authorization commitment",
  validCase({ authorizationOverride: randomBytes(32) }),
  after,
);

const amountMutation = validCase();
u64(DEPOSIT_AMOUNT + 1n).copy(amountMutation.instruction.data, 8);
await expectRollback("amount mismatch", amountMutation, after);

await expectRollback("insufficient token balance", validCase({ amount: after.source + 1n }), after);

console.log(JSON.stringify({
  cluster: RPC,
  programId: PROGRAM_ID.toBase58(),
  signature,
  mint: MINT.toBase58(),
  source: SOURCE.toBase58(),
  vault: vault.toBase58(),
  reserveState: reserveState.toBase58(),
  fundingRoot: fundingRoot.toBase58(),
  fundingClaim: successful.fundingClaim.toBase58(),
  fundingNonce: fundingNonce.toBase58(),
  before,
  after,
  claim,
  rejectionResults,
  arithmeticOverflowCoverage: "local Rust unit tests",
  confidentialOwnershipCreated: false,
  assetContainerCreatedOrCredited: false,
  publicExitExecuted: false,
  reserveWithdrawalExecuted: false,
  tsnStateCreated: false,
}, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
