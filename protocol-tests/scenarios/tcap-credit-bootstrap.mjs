/* Devnet-only bootstrap for the TSN -> TCAP credit smoke path.
 *
 * This script deliberately does not invent authorization material. Public
 * PDAs are derived from deployed programs and existing accounts are reused.
 * Owner/TSN signed commitments, nullifiers and settlement digests must be
 * supplied by the caller. The generated env is therefore a real, auditable
 * fixture and never a synthetic green-test fixture.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { computeTcapBalanceSnapshotCommitment } from "../../tcap-protocol/tcap-sdk/dist/index.js";
import {
  deriveDevnetTestPrivacyReceivingRootCommitment,
  deriveDevnetTestPolicyCommitment,
  deriveDevnetTestTcapGenesisCommitment,
} from "../lib/privacy-root-commitment.mjs";

const TCAP = new PublicKey("TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");
const TSN = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
// Explicit Devnet-only governance value. This is not a production Merkle-root
// claim; it is the domain-separated empty root approved for this Devnet fixture.
const DEVNET_EMPTY_TREE_ROOT_HEX = "47f64a304f10f65277568d1a061f669389cca93a55cac74712d7c1d99dddedff";
const SYSTEM = SystemProgram.programId;
const h = (s) => createHash("sha256").update(s).digest();
const disc = (s) => h(`global:${s}`).subarray(0, 8);
const b32 = (v, n) => { if (!/^[0-9a-f]{64}$/i.test(v ?? "")) throw new Error(`${n}_must_be_32_byte_hex`); return Buffer.from(v, "hex"); };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(Number(n)); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(Number(n)); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const pk = (v, n) => { try { return new PublicKey(v); } catch { throw new Error(`${n}_invalid`); } };
const seed = (s) => Buffer.from(s);
const [config] = PublicKey.findProgramAddressSync([seed("tcap:global-config:v1")], TCAP);
const [registry] = PublicKey.findProgramAddressSync([seed("tcap:asset-registry:v1")], TCAP);
const [commitmentRoot] = PublicKey.findProgramAddressSync([seed("tcap:commitment-root:v1")], TCAP);
const [mother] = PublicKey.findProgramAddressSync([seed("tsn_mother_escrow")], TSN);
const ACCEPTED_INTENT_SEED = seed("tsn:accepted-intent:v1");
const ACCEPTED_INTENT_ROOT_DOMAIN = seed("TSN_ACCEPTED_INTENT_ROOT_V1");
const deriveAcceptedIntentRoot = ({ epochId, intentCommitment, amount, tokenId, tipRoot, settlementCommitment, assetCommitment, policyCommitment, gpruScopeCommitment, replayNonce, nullifier, validAfterSlot, expiresAtSlot }) => createHash("sha256").update(Buffer.concat([
  ACCEPTED_INTENT_ROOT_DOMAIN, u64(epochId), b32(intentCommitment, "TCAP_INTENT_COMMITMENT"), u64(amount), u32(tokenId),
  b32(tipRoot, "TCAP_TIP_ROOT_COMMITMENT"), b32(settlementCommitment, "TCAP_TSN_SETTLEMENT_COMMITMENT"),
  b32(assetCommitment, "TCAP_ASSET_COMMITMENT"), b32(policyCommitment, "TCAP_POLICY_COMMITMENT"),
  b32(gpruScopeCommitment, "TCAP_GPRU_SCOPE_COMMITMENT"), b32(replayNonce, "TCAP_REPLAY_NONCE"),
  b32(nullifier, "TCAP_NULLIFIER"), u64(validAfterSlot), u64(expiresAtSlot),
])).digest().toString("hex");

function rpc() { return process.env.TCAP_RPC_URL ?? process.env.ANCHOR_PROVIDER_URL ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com"; }
function walletPath() { return process.env.TRUSTLINK_TEST_WALLET_KEYPAIR ?? process.env.SOLANA_WALLET ?? `${os.homedir()}/.config/solana/id.json`; }
function governanceWalletPath() { return process.env.TCAP_GOVERNANCE_WALLET ?? process.env.SOLANA_WALLET ?? `${os.homedir()}/.config/solana/id.json`; }
function loadWallet(file) { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")))); }
function show(label, address, exists) { console.log(`${label}: ${address.toBase58()} (${exists ? "reused" : "missing"})`); }
function required(name) { const v = process.env[name]; if (!v?.trim()) throw new Error(`MISSING_DEPENDENCY ${name}: provide owner/TSN-authorized value; refusing to fabricate it`); return v.trim(); }

async function main() {
  const url = rpc();
  if (!/devnet/i.test(url) && !/api\.devnet\.solana\.com/i.test(url)) throw new Error(`DEVNET_ONLY_RPC_REQUIRED: ${url}`);
  const file = walletPath();
  const payer = loadWallet(file);
  const governanceFile = governanceWalletPath();
  const governancePayer = loadWallet(governanceFile);
  const connection = new Connection(url, "confirmed");
  console.log(`RPC: ${new URL(url).host}`);
  console.log(`Wallet: ${file} (${payer.publicKey.toBase58()})`);
  console.log(`Governance wallet: ${governanceFile} (${governancePayer.publicKey.toBase58()})`);
  console.log(`TSN: ${TSN.toBase58()}`);
  console.log(`TCAP: ${TCAP.toBase58()}`);

  const info = async (address) => Boolean(await connection.getAccountInfo(address));
  const motherExists = await info(mother); show("TSN Mother Escrow", mother, motherExists);
  if (!motherExists) {
    const protocolSeed = required("TSN_PROTOCOL_SEED_HEX");
    const seedBytes = b32(protocolSeed, "TSN_PROTOCOL_SEED_HEX");
    const tins = pk(process.env.TINS_PROGRAM_ID ?? "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT", "TINS_PROGRAM_ID");
    const args = Buffer.concat([tins.toBuffer(), seedBytes, u64(process.env.TSN_EPOCH_SECONDS ?? "3600"), u64(process.env.TSN_LEASE_SECONDS ?? "900"), Buffer.from([0]), u16(0), Buffer.from([0]), u16(0), Buffer.from([0]), u16(0)]);
    const ix = new TransactionInstruction({ programId: TSN, keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, { pubkey: mother, isSigner: false, isWritable: true }, { pubkey: SYSTEM, isSigner: false, isWritable: false },
    ], data: Buffer.concat([disc("tsn_initialize_mother_escrow"), args]) });
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], { commitment: "confirmed" });
    console.log(`Created TSN Mother Escrow: ${mother.toBase58()} tx=${sig}`);
  }

  for (const [label, address] of [["TCAP config", config], ["TCAP asset registry", registry], ["TCAP commitment root", commitmentRoot]]) show(label, address, await info(address));
  if (!(await info(config))) throw new Error("MISSING_DEPENDENCY TCAP_CONFIG: run npm/bootstrap existing devnet-initialize.mjs with the governance wallet");
  let configAccount = await connection.getAccountInfo(config);
  // The checked-in TCAP program expects proof-verifier/paused flags before the
  // commitment-root field. Detect the older 244-byte layout before submitting
  // any root transaction; Anchor otherwise reports only AccountDidNotDeserialize.
  if (configAccount.data.length === 244 && (configAccount.data[206] > 1 || configAccount.data[207] > 1)) {
    if (process.env.TCAP_RUN_CONFIG_MIGRATION === "0") throw new Error("MISSING_DEPENDENCY TCAP_CONFIG_LAYOUT_MIGRATION: on-chain config is the pre-proof-verifier layout; deploy/run the governed config migration before initializing the commitment root");
    console.log("Legacy TCAP config layout detected; submitting governance-only migration.");
    const migration = new TransactionInstruction({ programId: TCAP, keys: [
      { pubkey: governancePayer.publicKey, isSigner: true, isWritable: true }, { pubkey: config, isSigner: false, isWritable: true }, { pubkey: SYSTEM, isSigner: false, isWritable: false },
    ], data: disc("migrate_tcap_config_layout_v1") });
    const migrationSig = await sendAndConfirmTransaction(connection, new Transaction().add(migration), [governancePayer], { commitment: "confirmed" });
    console.log(`TCAP config migration tx: ${migrationSig}`);
    configAccount = await connection.getAccountInfo(config);
  }
  if (!(await info(commitmentRoot))) {
    const empty = (process.env.TCAP_EMPTY_TREE_ROOT_HEX ?? DEVNET_EMPTY_TREE_ROOT_HEX).trim();
    const configData = configAccount.data;
    const governance = new PublicKey(configData.subarray(14, 46));
    if (!governance.equals(governancePayer.publicKey)) throw new Error(`MISSING_DEPENDENCY TCAP_COMMITMENT_ROOT: governance authority is ${governance.toBase58()}, but supplied governance wallet is ${governancePayer.publicKey.toBase58()}`);
    const ix = new TransactionInstruction({ programId: TCAP, keys: [
      { pubkey: governancePayer.publicKey, isSigner: true, isWritable: true }, { pubkey: config, isSigner: false, isWritable: false }, { pubkey: commitmentRoot, isSigner: false, isWritable: true }, { pubkey: SYSTEM, isSigner: false, isWritable: false },
    ], data: Buffer.concat([disc("initialize_commitment_root_v1"), b32(empty, "TCAP_EMPTY_TREE_ROOT_HEX")]) });
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [governancePayer], { commitment: "confirmed" });
    console.log(`Created TCAP commitment root: ${commitmentRoot.toBase58()} tx=${sig}`);
  }
  if (!(await info(registry))) throw new Error("MISSING_DEPENDENCY TCAP_ASSET_REGISTRY: initialize asset registry before credit");

  const mint = required("TCAP_MINT");
  const tokenProgram = pk(process.env.TCAP_TOKEN_PROGRAM ?? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TCAP_TOKEN_PROGRAM");
  const mintKey = pk(mint, "TCAP_MINT");
  const [assetEntry] = PublicKey.findProgramAddressSync([seed("tcap:asset-entry:v1"), registry.toBuffer(), tokenProgram.toBuffer(), mintKey.toBuffer()], TCAP);
  const [reserve] = PublicKey.findProgramAddressSync([seed("tcap:reserve-state:v1"), assetEntry.toBuffer()], TCAP);
  show("TCAP asset entry", assetEntry, await info(assetEntry));
  show("TCAP reserve state", reserve, await info(reserve));
  if (!(await info(assetEntry))) throw new Error(`MISSING_DEPENDENCY TCAP_ASSET_ENTRY: register the governed mint ${mintKey.toBase58()} using the repository asset-governance flow`);
  if (!(await info(reserve))) throw new Error("MISSING_DEPENDENCY TCAP_RESERVE_STATE: initialize and govern the reserve before credit");

  const root = process.env.TCAP_TIP_ROOT_COMMITMENT?.trim()
    ?? await deriveDevnetTestPrivacyReceivingRootCommitment(
      payer.publicKey.toBase58(),
      process.env.TCAP_DEVNET_TEST_IDENTITY_LABEL ?? "fixture-wallet-v1",
    );
  if (!process.env.TCAP_TIP_ROOT_COMMITMENT) {
    console.log(`Derived controlled Devnet tip root (test identity only): ${root}`);
  }
  const identityLabel = process.env.TCAP_DEVNET_TEST_IDENTITY_LABEL ?? "fixture-wallet-v1";
  const policy = process.env.TCAP_POLICY_COMMITMENT?.trim()
    ?? deriveDevnetTestPolicyCommitment(payer.publicKey.toBase58(), identityLabel);
  if (!process.env.TCAP_POLICY_COMMITMENT) console.log(`Derived controlled Devnet policy commitment (test identity only): ${policy}`);
  let previous = process.env.TCAP_INITIAL_COMMITMENT?.trim();
  let sequence = BigInt(process.env.TCAP_SEQUENCE ?? "1");
  const [tip] = PublicKey.findProgramAddressSync([seed("tcap:tin-tip:v1"), b32(root, "TCAP_TIP_ROOT_COMMITMENT")], TCAP);
  const tipInfo = await connection.getAccountInfo(tip);
  if (tipInfo) {
    previous = tipInfo.data.subarray(10, 42).toString("hex");
    const onchainSequence = tipInfo.data.readBigUInt64LE(42);
    sequence = onchainSequence + 1n;
    const onchainPolicy = tipInfo.data.subarray(50, 82).toString("hex");
    if (onchainPolicy !== policy.toLowerCase()) throw new Error("MISSING_DEPENDENCY TCAP_POLICY_COMMITMENT: supplied policy does not match the existing tip");
    console.log(`TCAP tip: ${tip.toBase58()} (reused; previous commitment read from chain)`);
  } else {
    previous = process.env.TCAP_INITIAL_COMMITMENT?.trim()
      ?? deriveDevnetTestTcapGenesisCommitment(payer.publicKey.toBase58(), policy, identityLabel);
    if (!process.env.TCAP_INITIAL_COMMITMENT) console.log(`Derived controlled Devnet genesis commitment (test identity only): ${previous}`);
    const init = new TransactionInstruction({ programId: TCAP, keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }, { pubkey: tip, isSigner: false, isWritable: true }, { pubkey: SYSTEM, isSigner: false, isWritable: false }], data: Buffer.concat([disc("initialize_tcap_tin_tip_v1"), b32(root, "TCAP_TIP_ROOT_COMMITMENT"), b32(previous, "TCAP_INITIAL_COMMITMENT"), b32(policy, "TCAP_POLICY_COMMITMENT")]) });
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(init), [payer], { commitment: "confirmed" });
    console.log(`Created TCAP tip: ${tip.toBase58()} tx=${sig}`);
  }
  const motherData = (await connection.getAccountInfo(mother)).data;
  const derivedEpochId = motherData.readBigUInt64LE(134).toString();
  const epochId = process.env.TCAP_EPOCH_ID?.trim() ?? derivedEpochId;
  if (!process.env.TCAP_EPOCH_ID) console.log(`Derived current TSN epoch from Mother Escrow: ${epochId}`);
  const [epoch] = PublicKey.findProgramAddressSync([seed("tsn:epoch-commitment:v1"), mother.toBuffer(), u64(epochId)], TSN);
  show("TSN epoch commitment", epoch, await info(epoch));
  console.log("TSN epoch commitment is canonical and will be created/reused by tsn_register_tcap_credit_authorization; it is not an opaque account.");

  for (const n of ["TCAP_INTENT_COMMITMENT", "TCAP_AMOUNT", "TCAP_ASSET_COMMITMENT", "TCAP_AUTHORIZATION_DIGEST", "TCAP_REPLAY_NONCE", "TCAP_GPRU_SCOPE_COMMITMENT", "TCAP_TSN_SETTLEMENT_COMMITMENT", "TCAP_TOKEN_ID"]) required(n);
  const intentCommitment = b32(process.env.TCAP_INTENT_COMMITMENT, "TCAP_INTENT_COMMITMENT");
  const amount = BigInt(process.env.TCAP_AMOUNT);
  const tokenId = Number(process.env.TCAP_TOKEN_ID);
  if (amount <= 0n || tokenId <= 0) throw new Error("TCAP_AMOUNT_AND_TOKEN_ID_MUST_BE_POSITIVE");
  const validAfter = process.env.TCAP_VALID_AFTER_SLOT ?? String(await connection.getSlot("confirmed"));
  const expires = process.env.TCAP_EXPIRES_AT_SLOT ?? String(Number(validAfter) + Number(process.env.TCAP_VALIDITY_WINDOW_SLOTS ?? 150));
  const acceptedIntentRoot = deriveAcceptedIntentRoot({
    epochId, intentCommitment: process.env.TCAP_INTENT_COMMITMENT, amount, tokenId,
    tipRoot: root, settlementCommitment: process.env.TCAP_TSN_SETTLEMENT_COMMITMENT,
    assetCommitment: process.env.TCAP_ASSET_COMMITMENT, policyCommitment: policy,
    gpruScopeCommitment: process.env.TCAP_GPRU_SCOPE_COMMITMENT,
    replayNonce: process.env.TCAP_REPLAY_NONCE, nullifier: process.env.TCAP_NULLIFIER,
    validAfterSlot: validAfter, expiresAtSlot: expires,
  });
  const [acceptedIntent] = PublicKey.findProgramAddressSync([
    ACCEPTED_INTENT_SEED, mother.toBuffer(), u64(epochId), intentCommitment,
  ], TSN);
  const acceptedInfo = await connection.getAccountInfo(acceptedIntent);
  if (!acceptedInfo) {
    const motherData = await connection.getAccountInfo(mother);
    const motherAuthority = new PublicKey(motherData.data.subarray(8, 40));
    if (!motherAuthority.equals(payer.publicKey)) throw new Error(`MISSING_DEPENDENCY TSN_MOTHER_AUTHORITY: AcceptedIntent creation requires ${motherAuthority.toBase58()}, but fixture wallet is ${payer.publicKey.toBase58()}`);
    const acceptArgs = Buffer.concat([
      u64(epochId), intentCommitment, u64(amount), u32(tokenId), b32(root, "TCAP_TIP_ROOT_COMMITMENT"),
      b32(process.env.TCAP_TSN_SETTLEMENT_COMMITMENT, "TCAP_TSN_SETTLEMENT_COMMITMENT"), b32(process.env.TCAP_ASSET_COMMITMENT, "TCAP_ASSET_COMMITMENT"),
      b32(policy, "TCAP_POLICY_COMMITMENT"), b32(process.env.TCAP_GPRU_SCOPE_COMMITMENT, "TCAP_GPRU_SCOPE_COMMITMENT"),
      b32(process.env.TCAP_REPLAY_NONCE, "TCAP_REPLAY_NONCE"), b32(process.env.TCAP_NULLIFIER, "TCAP_NULLIFIER"), u64(validAfter), u64(expires),
    ]);
    const ix = new TransactionInstruction({ programId: TSN, keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, { pubkey: mother, isSigner: false, isWritable: false },
      { pubkey: acceptedIntent, isSigner: false, isWritable: true }, { pubkey: SYSTEM, isSigner: false, isWritable: false },
    ], data: Buffer.concat([disc("tsn_accept_intent"), acceptArgs]) });
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], { commitment: "confirmed" });
    console.log(`Created TSN AcceptedIntentV1: ${acceptedIntent.toBase58()} tx=${sig}`);
  } else {
    if (!acceptedInfo.owner.equals(TSN) || acceptedInfo.data.length < 334 || acceptedInfo.data.subarray(302, 334).toString("hex") !== acceptedIntentRoot) throw new Error("MISSING_DEPENDENCY TSN_ACCEPTED_INTENT_MISMATCH: existing record is not the canonical intent for this credit");
    console.log(`TSN AcceptedIntentV1: ${acceptedIntent.toBase58()} (reused)`);
  }
  const rootData = (await connection.getAccountInfo(commitmentRoot)).data;
  const currentTcapRoot = rootData.subarray(12, 44).toString("hex");
  const previousTcapRoot = process.env.TCAP_PREVIOUS_TCAP_ROOT?.trim() ?? currentTcapRoot;
  if (!process.env.TCAP_PREVIOUS_TCAP_ROOT) console.log(`Derived TCAP previous root from commitment root account: ${previousTcapRoot}`);
  if (currentTcapRoot !== previousTcapRoot.toLowerCase()) throw new Error("MISSING_DEPENDENCY TCAP_PREVIOUS_TCAP_ROOT: value does not match TCAP commitment-root current_root");
  const balancesText = required("TCAP_TOKEN_BALANCES_JSON");
  let balances; try { balances = JSON.parse(balancesText); } catch { throw new Error("TCAP_TOKEN_BALANCES_JSON_invalid_json"); }
  if (!Array.isArray(balances) || !balances.length) throw new Error("TCAP_TOKEN_BALANCES_JSON must contain real owner balances; refusing an empty synthetic snapshot");
  const key = randomBytes(32);
  const snapshot = { version: 1, sequence, previous_commitment: previous.toLowerCase(), token_balances: balances.map((x) => ({ token_id: Number(x.token_id), native_amount: BigInt(x.native_amount), stable_units: BigInt(x.stable_units), stable_rate_version: Number(x.stable_rate_version) })), policy_commitment: policy.toLowerCase(), transition_nullifier: required("TCAP_NULLIFIER").toLowerCase(), tsn_settlement_commitment: process.env.TCAP_TSN_SETTLEMENT_COMMITMENT.toLowerCase(), created_at: BigInt(Math.floor(Date.now() / 1000)), encrypted_record_locator: `devnet:${payer.publicKey.toBase58()}:${Date.now()}` };
  const next = await computeTcapBalanceSnapshotCommitment(snapshot);
  const env = [
    `TCAP_PROGRAM_ID=${TCAP.toBase58()}`, `TSN_PROGRAM_ID=${TSN.toBase58()}`, `TCAP_EMPTY_TREE_ROOT_HEX=${(process.env.TCAP_EMPTY_TREE_ROOT_HEX ?? DEVNET_EMPTY_TREE_ROOT_HEX).toLowerCase()}`, `TSN_MOTHER_ESCROW=${mother.toBase58()}`, `TSN_EPOCH_COMMITMENT=${epoch.toBase58()}`,
    `TCAP_CONFIG=${config.toBase58()}`, `TCAP_ASSET_REGISTRY=${registry.toBase58()}`, `TCAP_ASSET_ENTRY=${assetEntry.toBase58()}`, `TCAP_RESERVE_STATE=${reserve.toBase58()}`, `TCAP_TIP_ROOT_COMMITMENT=${root.toLowerCase()}`, `TCAP_TIP=${tip.toBase58()}`,
    `TCAP_ACCEPTED_INTENT=${acceptedIntent.toBase58()}`, `TCAP_ACCEPTED_INTENT_ROOT=${acceptedIntentRoot}`, `TCAP_INTENT_COMMITMENT=${intentCommitment.toString("hex")}`, `TCAP_AMOUNT=${amount}`, `TCAP_EPOCH_ID=${epochId}`,
    `TCAP_INITIAL_COMMITMENT=${previous.toLowerCase()}`, `TCAP_NEW_COMMITMENT=${next}`, `TCAP_POLICY_COMMITMENT=${policy.toLowerCase()}`, `TCAP_VALID_AFTER_SLOT=${validAfter}`, `TCAP_EXPIRES_AT_SLOT=${expires}`, `TCAP_SEQUENCE=${sequence}`,
    `TCAP_PREVIOUS_TCAP_ROOT=${previousTcapRoot.toLowerCase()}`,
    ...["TCAP_ASSET_COMMITMENT", "TCAP_AUTHORIZATION_DIGEST", "TCAP_NULLIFIER", "TCAP_REPLAY_NONCE", "TCAP_GPRU_SCOPE_COMMITMENT", "TCAP_TSN_SETTLEMENT_COMMITMENT", "TCAP_TOKEN_ID"].map((n) => `${n}=${process.env[n]}`),
    `TCAP_SNAPSHOT_KEY_HEX=${key.toString("hex")}`, `TCAP_PRIVATE_SNAPSHOT_JSON=${JSON.stringify({ token_balances: balances, created_at: snapshot.created_at.toString(), encrypted_record_locator: snapshot.encrypted_record_locator })}`,
  ];
  const out = path.resolve("protocol-tests/tcap-credit-devnet.env"); fs.writeFileSync(out, `${env.join("\n")}\n`, { mode: 0o600 });
  console.log(`Wrote real Devnet credit env: ${out}`);
  console.log("No transaction was submitted for credit; register + credit remains the next explicit smoke step.");
}
main().catch((e) => { console.error(`BOOTSTRAP_FAILED: ${e.message}`); process.exitCode = 1; });
