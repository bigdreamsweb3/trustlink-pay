if (process.env.TCAP_ALLOW_LEGACY_V1 !== "1") {
  throw new Error("Legacy TSN AcceptedIntent/TCAP receipt bootstrap is disabled. Use the privacy-safe V2 GPRU path.");
}

/* Devnet-only bootstrap for the legacy TSN -> TCAP credit smoke path.
 *
 * This script derives the ConfidentialSettlement fields with the same
 * domain-separated formulas enforced by TSN. Public PDAs are derived from
 * deployed programs and existing accounts are reused; no random placeholder
 * roots, nullifiers or settlement digests are accepted.
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
import {
  buildFundAndAcceptIntentTransaction,
  deriveTsnFundingPdas,
  deriveConfidentialReplayNonce,
  deriveConfidentialSettlementFields,
  deriveConfidentialAuthorizationDigest,
} from "../../tcap-protocol/scripts/tcap-credit-transaction.mjs";

const DEFAULTS_FILE = path.resolve(process.env.TCAP_DEVNET_DEFAULTS_FILE ?? "protocol-tests/tcap-credit-devnet.defaults.env");
function loadDefaults(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadDefaults(DEFAULTS_FILE);

const EXPECTED_TCAP = "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x";
const EXPECTED_TSN = "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V";
const TCAP = new PublicKey(process.env.TCAP_PROGRAM_ID ?? EXPECTED_TCAP);
const TSN = new PublicKey(process.env.TSN_PROGRAM_ID ?? EXPECTED_TSN);
// Explicit Devnet-only governance value. This is not a production Merkle-root
// claim; it is the domain-separated empty root approved for this Devnet fixture.
const DEVNET_EMPTY_TREE_ROOT_HEX = "47f64a304f10f65277568d1a061f669389cca93a55cac74712d7c1d99dddedff";
const SYSTEM = SystemProgram.programId;
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
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
const PAYMENT_INTENT_DOMAIN = seed("TSN_PAYMENT_INTENT_COMMITMENT_V1");
// Canonical controlled-payment intent commitment order:
// domain || epoch_id || amount || token_id || token_mint || tip_root || policy
// || replay_nonce || valid_after_slot || expires_at_slot || asset. Derived
// settlement/GPRU/nullifier fields bind to this immutable intent commitment in
// their own domain-separated records, avoiding a circular hash dependency.
const derivePaymentIntentCommitment = ({ epochId, amount, tokenId, tokenMint, tipRoot, policyCommitment, replayNonce, validAfterSlot, expiresAtSlot, settlementCommitment, assetCommitment, gpruScopeCommitment }) => createHash("sha256").update(Buffer.concat([
  PAYMENT_INTENT_DOMAIN, u64(epochId), u64(amount), u32(tokenId), tokenMint.toBuffer(),
  b32(tipRoot, "TCAP_TIP_ROOT_COMMITMENT"), b32(policyCommitment, "TCAP_POLICY_COMMITMENT"),
  b32(replayNonce, "TCAP_REPLAY_NONCE"), u64(validAfterSlot), u64(expiresAtSlot),
  b32(assetCommitment, "TCAP_ASSET_COMMITMENT"),
])).digest().toString("hex");
const deriveAcceptedIntentRoot = ({ epochId, intentCommitment, amount, tokenId, tipRoot, settlementCommitment, assetCommitment, policyCommitment, gpruScopeCommitment, replayNonce, nullifier, validAfterSlot, expiresAtSlot }) => createHash("sha256").update(Buffer.concat([
  ACCEPTED_INTENT_ROOT_DOMAIN, u64(epochId), b32(intentCommitment, "TCAP_INTENT_COMMITMENT"), u64(amount), u32(tokenId),
  b32(tipRoot, "TCAP_TIP_ROOT_COMMITMENT"), b32(settlementCommitment, "TCAP_TSN_SETTLEMENT_COMMITMENT"),
  b32(assetCommitment, "TCAP_ASSET_COMMITMENT"), b32(policyCommitment, "TCAP_POLICY_COMMITMENT"),
  b32(gpruScopeCommitment, "TCAP_GPRU_SCOPE_COMMITMENT"), b32(replayNonce, "TCAP_REPLAY_NONCE"),
  b32(nullifier, "TCAP_NULLIFIER"), u64(validAfterSlot), u64(expiresAtSlot),
])).digest().toString("hex");

function configuredAnchorRpc() {
  for (const file of ["tcap-protocol/Anchor.toml", "tsn-protocol/tsn/protocol/Anchor.toml"]) {
    try {
      const match = fs.readFileSync(path.resolve(file), "utf8").match(/^cluster\s*=\s*"([^"]+)"/m);
      if (match?.[1] && /^https?:\/\//i.test(match[1])) return match[1];
    } catch { /* use the next configured source */ }
  }
  return undefined;
}
function rpc() {
  return process.env.TCAP_RPC_URL ?? process.env.ANCHOR_PROVIDER_URL ?? process.env.SOLANA_RPC_URL
    ?? configuredAnchorRpc() ?? "https://api.devnet.solana.com";
}
function walletPath() {
  return process.env.TRUSTLINK_TEST_WALLET_KEYPAIR ?? process.env.SOLANA_WALLET
    ?? path.resolve("protocol-tests/tcap-devnet-test-wallet.json");
}
function expandHome(value) { return value?.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value; }
function governanceWalletPath() { return expandHome(process.env.TCAP_GOVERNANCE_WALLET ?? process.env.TCAP_GOVERNANCE_KEYPAIR ?? process.env.SOLANA_WALLET ?? `${os.homedir()}/.config/solana/id.json`); }
function loadWallet(file) { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")))); }
function optionalWallet(file) {
  if (!file || !fs.existsSync(file)) return null;
  try { return loadWallet(file); } catch { return null; }
}
function show(label, address, exists) { console.log(`${label}: ${address.toBase58()} (${exists ? "reused" : "missing"})`); }
function required(name) { const v = process.env[name]; if (!v?.trim()) throw new Error(`MISSING_DEPENDENCY ${name}: provide owner/TSN-authorized value; refusing to fabricate it`); return v.trim(); }
function verifyConfiguredPda(name, derived) {
  const configured = process.env[name]?.trim();
  if (configured && !new PublicKey(configured).equals(derived)) {
    throw new Error(`DEVNET_DEFAULT_MISMATCH ${name}: configured ${configured}, canonical ${derived.toBase58()}`);
  }
}
async function requireOwnedAccount(connection, address, owner, label) {
  const account = await getAccountInfoWithRetry(connection, address, label);
  if (!account) throw new Error(`MISSING_DEPENDENCY ${label}: ${address.toBase58()} is not present on Devnet`);
  if (!account.owner.equals(owner)) throw new Error(`DEVNET_ACCOUNT_OWNER_MISMATCH ${label}: ${address.toBase58()} is owned by ${account.owner.toBase58()}, expected ${owner.toBase58()}`);
  return account;
}

async function getAccountInfoWithRetry(connection, address, label = "account") {
  const attempts = Math.max(1, Number(process.env.TCAP_RPC_READ_RETRIES ?? "4"));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await connection.getAccountInfo(address);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delayMs = Math.min(2000, 250 * (2 ** (attempt - 1)));
      console.warn(`RPC read retry ${attempt}/${attempts - 1} for ${label} ${address.toBase58()} after ${error?.message ?? "unknown error"}; waiting ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`RPC_READ_FAILED: ${label} ${address.toBase58()} after ${attempts} attempts: ${lastError?.message ?? "unknown error"}`);
}

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
  console.log(`Defaults: ${DEFAULTS_FILE} (${fs.existsSync(DEFAULTS_FILE) ? "loaded; environment overrides win" : "not found"})`);
  if (TCAP.toBase58() !== EXPECTED_TCAP || TSN.toBase58() !== EXPECTED_TSN) throw new Error("DEPLOYED_PROGRAM_ID_MISMATCH: use the checked-in Devnet TSN/TCAP programs");

  verifyConfiguredPda("TSN_MOTHER_ESCROW", mother);
  verifyConfiguredPda("TCAP_CONFIG", config);
  verifyConfiguredPda("TCAP_ASSET_REGISTRY", registry);
  verifyConfiguredPda("TCAP_COMMITMENT_ROOT", commitmentRoot);

  const info = async (address, label = "account") => Boolean(await getAccountInfoWithRetry(connection, address, label));
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

  // AcceptedIntent is authorized by Mother Escrow's on-chain authority. The
  // fixture wallet may fund the treasury, but it must not be substituted for
  // Mother. Resolve a real signer and fail closed if its key is unavailable.
  const motherAccountData = await getAccountInfoWithRetry(connection, mother, "TSN Mother Escrow");
  if (!motherAccountData || motherAccountData.data.length < 40) throw new Error("MISSING_DEPENDENCY TSN_MOTHER_ESCROW_LAYOUT: cannot read Mother authority");
  const motherAuthority = new PublicKey(motherAccountData.data.subarray(8, 40));
  const signerCandidates = [
    ["fixture wallet", payer],
    ["governance wallet", governancePayer],
    ["TSN_MOTHER_AUTHORITY_WALLET", optionalWallet(process.env.TSN_MOTHER_AUTHORITY_WALLET)],
    ["ANCHOR_WALLET", optionalWallet(process.env.ANCHOR_WALLET)],
  ];
  const motherSignerEntry = signerCandidates.find(([, signer]) => signer?.publicKey.equals(motherAuthority));
  if (!motherSignerEntry) {
    const candidates = signerCandidates.filter(([, signer]) => signer).map(([label, signer]) => `${label}=${signer.publicKey.toBase58()}`).join(", ");
    throw new Error(`MISSING_DEPENDENCY TSN_MOTHER_AUTHORITY: required signer ${motherAuthority.toBase58()} is not available. Set TSN_MOTHER_AUTHORITY_WALLET to its keypair; available candidates: ${candidates || "none"}`);
  }
  const motherSigner = motherSignerEntry[1];
  console.log(`TSN Mother authority: ${motherAuthority.toBase58()} (${motherSignerEntry[0]} signer)`);

  for (const [label, address] of [["TCAP config", config], ["TCAP asset registry", registry], ["TCAP commitment root", commitmentRoot]]) show(label, address, await info(address));
  if (!(await info(config))) throw new Error("MISSING_DEPENDENCY TCAP_CONFIG: run npm/bootstrap existing devnet-initialize.mjs with the governance wallet");
  await requireOwnedAccount(connection, config, TCAP, "TCAP_CONFIG");
  await requireOwnedAccount(connection, registry, TCAP, "TCAP_ASSET_REGISTRY");
  let configAccount = await getAccountInfoWithRetry(connection, config, "TCAP config");
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
    configAccount = await getAccountInfoWithRetry(connection, config, "TCAP config after migration");
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
  const mintInfo = await getAccountInfoWithRetry(connection, mintKey, "TCAP mint");
  if (!mintInfo) throw new Error(`MISSING_DEPENDENCY TCAP_MINT: ${mintKey.toBase58()} is not present on Devnet`);
  if (!mintInfo.owner.equals(tokenProgram)) throw new Error(`DEVNET_MINT_OWNER_MISMATCH: ${mintKey.toBase58()} is owned by ${mintInfo.owner.toBase58()}, expected ${tokenProgram.toBase58()}`);
  const expectedDecimals = Number(process.env.TCAP_MINT_DECIMALS ?? "6");
  const actualDecimals = mintInfo.data.length > 44 ? mintInfo.data[44] : -1;
  if (actualDecimals !== expectedDecimals) throw new Error(`DEVNET_MINT_DECIMALS_MISMATCH: ${mintKey.toBase58()} has ${actualDecimals}, expected ${expectedDecimals}`);
  console.log(`TCAP mint: ${mintKey.toBase58()} (${actualDecimals} decimals; ${process.env.TCAP_AMOUNT ?? "unset"} base units)`);
  const [assetEntry] = PublicKey.findProgramAddressSync([seed("tcap:asset-entry:v1"), registry.toBuffer(), tokenProgram.toBuffer(), mintKey.toBuffer()], TCAP);
  const [reserve] = PublicKey.findProgramAddressSync([seed("tcap:reserve-state:v1"), assetEntry.toBuffer()], TCAP);
  const [governancePolicy] = PublicKey.findProgramAddressSync([seed("tcap:asset-governance:v2"), assetEntry.toBuffer()], TCAP);
  const [extensionPolicy] = PublicKey.findProgramAddressSync([seed("tcap:extension-policy:v2"), assetEntry.toBuffer()], TCAP);
  show("TCAP asset entry", assetEntry, await info(assetEntry));
  show("TCAP reserve state", reserve, await info(reserve));
  if (!(await info(assetEntry))) throw new Error(`MISSING_DEPENDENCY TCAP_ASSET_ENTRY: register the governed mint ${mintKey.toBase58()} using the repository asset-governance flow`);
  if (!(await info(reserve))) throw new Error("MISSING_DEPENDENCY TCAP_RESERVE_STATE: initialize and govern the reserve before credit");
  if (!(await info(governancePolicy))) throw new Error("MISSING_DEPENDENCY TCAP_GOVERNANCE_POLICY: initialize the current V2 asset governance policy before credit");
  if (!(await info(extensionPolicy))) throw new Error("MISSING_DEPENDENCY TCAP_EXTENSION_POLICY: initialize the current V2 asset extension policy before credit");
  const assetEntryInfo = await requireOwnedAccount(connection, assetEntry, TCAP, "TCAP_ASSET_ENTRY");
  await requireOwnedAccount(connection, reserve, TCAP, "TCAP_RESERVE_STATE");
  const assetEntryDiscriminator = createHash("sha256").update("account:TcapAssetEntryV1").digest().subarray(0, 8);
  if (assetEntryInfo.data.length < 287 || !assetEntryInfo.data.subarray(0, 8).equals(assetEntryDiscriminator)) {
    throw new Error(`DEVNET_ASSET_ENTRY_LEGACY_OR_TRUNCATED: refusing credit against ${assetEntry}; expected current TcapAssetEntryV1 (>=287 bytes)`);
  }
  if (!assetEntryInfo.data.subarray(80, 112).equals(mintKey.toBuffer()) || !assetEntryInfo.data.subarray(48, 80).equals(tokenProgram.toBuffer())) {
    throw new Error("DEVNET_ASSET_ENTRY_BINDING_MISMATCH: asset entry is not bound to the configured mint and token program");
  }
  const onchainAssetCommitment = assetEntryInfo.data.subarray(116, 148).toString("hex");
  if (/^0+$/.test(onchainAssetCommitment)) throw new Error("MISSING_DEPENDENCY TCAP_ASSET_COMMITMENT: governed asset entry contains an empty commitment");
  const assetCommitment = (process.env.TCAP_ASSET_COMMITMENT ?? onchainAssetCommitment).toLowerCase();
  if (assetCommitment !== onchainAssetCommitment) throw new Error(`TCAP_ASSET_COMMITMENT_MISMATCH: supplied ${assetCommitment}, on-chain asset entry has ${onchainAssetCommitment}`);
  const onchainTokenId = assetEntryInfo.data.readUInt32LE(44);

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
  const tipInfo = await getAccountInfoWithRetry(connection, tip, "TCAP tip");
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
  const motherData = (await getAccountInfoWithRetry(connection, mother, "TSN Mother Escrow epoch")).data;
  const derivedEpochId = motherData.readBigUInt64LE(134).toString();
  const epochId = process.env.TCAP_EPOCH_ID?.trim() ?? derivedEpochId;
  if (!process.env.TCAP_EPOCH_ID) console.log(`Derived current TSN epoch from Mother Escrow: ${epochId}`);
  const [epoch] = PublicKey.findProgramAddressSync([seed("tsn:epoch-commitment:v1"), mother.toBuffer(), u64(epochId)], TSN);
  show("TSN epoch commitment", epoch, await info(epoch));
  console.log("TSN epoch commitment is canonical and will be created/reused by tsn_register_tcap_credit_authorization; it is not an opaque account.");

  const amount = BigInt(required("TCAP_AMOUNT"));
  const tokenId = Number(process.env.TCAP_TOKEN_ID ?? onchainTokenId);
  if (process.env.TCAP_TOKEN_ID && tokenId !== onchainTokenId) throw new Error(`TCAP_TOKEN_ID_MISMATCH: supplied ${tokenId}, on-chain asset entry has ${onchainTokenId}`);
  if (amount <= 0n || tokenId <= 0) throw new Error("TCAP_AMOUNT_AND_TOKEN_ID_MUST_BE_POSITIVE");
  const validAfter = process.env.TCAP_VALID_AFTER_SLOT ?? String(await connection.getSlot("confirmed"));
  const expires = process.env.TCAP_EXPIRES_AT_SLOT ?? String(Number(validAfter) + Number(process.env.TCAP_VALIDITY_WINDOW_SLOTS ?? 150));
  const replayNonce = process.env.TCAP_REPLAY_NONCE?.trim()
    ? b32(process.env.TCAP_REPLAY_NONCE, "TCAP_REPLAY_NONCE")
    : deriveConfidentialReplayNonce({ epochId, amount, tokenId, tokenMint: mintKey, tipRootCommitment: root, policyCommitment: policy, validAfterSlot: validAfter, expiresAtSlot: expires });
  if (!process.env.TCAP_REPLAY_NONCE) console.log(`Derived canonical replay nonce from the controlled signed-intent fields: ${replayNonce.toString("hex")}`);
  const intentCommitment = b32(process.env.TCAP_INTENT_COMMITMENT ?? derivePaymentIntentCommitment({
    epochId, amount, tokenId, tokenMint: mintKey, tipRoot: root, policyCommitment: policy,
    replayNonce: replayNonce.toString("hex"), validAfterSlot: validAfter, expiresAtSlot: expires,
    assetCommitment,
  }), "TCAP_INTENT_COMMITMENT");
  if (!process.env.TCAP_INTENT_COMMITMENT) console.log(`Derived canonical Devnet payment intent commitment: ${intentCommitment.toString("hex")}`);
  const derivedSettlement = deriveConfidentialSettlementFields({
    epochId, intentCommitment, amount, tokenId, tipRootCommitment: root,
    assetCommitment, policyCommitment: policy, replayNonce,
    validAfterSlot: validAfter, expiresAtSlot: expires,
  });
  const gpruScopeCommitment = process.env.TCAP_GPRU_SCOPE_COMMITMENT?.trim()
    ? b32(process.env.TCAP_GPRU_SCOPE_COMMITMENT, "TCAP_GPRU_SCOPE_COMMITMENT") : derivedSettlement.gpruScopeCommitment;
  const settlementCommitment = process.env.TCAP_TSN_SETTLEMENT_COMMITMENT?.trim()
    ? b32(process.env.TCAP_TSN_SETTLEMENT_COMMITMENT, "TCAP_TSN_SETTLEMENT_COMMITMENT") : derivedSettlement.settlementCommitment;
  const nullifier = process.env.TCAP_NULLIFIER?.trim()
    ? b32(process.env.TCAP_NULLIFIER, "TCAP_NULLIFIER") : derivedSettlement.nullifier;
  if (!process.env.TCAP_GPRU_SCOPE_COMMITMENT) console.log(`Derived canonical GPRU scope commitment: ${gpruScopeCommitment.toString("hex")}`);
  if (!process.env.TCAP_TSN_SETTLEMENT_COMMITMENT) console.log(`Derived canonical TSN settlement commitment: ${settlementCommitment.toString("hex")}`);
  if (!process.env.TCAP_NULLIFIER) console.log(`Derived canonical settlement nullifier: ${nullifier.toString("hex")}`);
  if (gpruScopeCommitment.toString("hex") !== derivedSettlement.gpruScopeCommitment.toString("hex") || settlementCommitment.toString("hex") !== derivedSettlement.settlementCommitment.toString("hex") || nullifier.toString("hex") !== derivedSettlement.nullifier.toString("hex")) {
    throw new Error("TSN_CONFIDENTIAL_FIELD_MISMATCH: supplied settlement fields do not match canonical derivation");
  }
  const acceptedIntentRoot = deriveAcceptedIntentRoot({
    epochId, intentCommitment: intentCommitment.toString("hex"), amount, tokenId,
    tipRoot: root, settlementCommitment: settlementCommitment.toString("hex"),
    assetCommitment, policyCommitment: policy,
    gpruScopeCommitment: gpruScopeCommitment.toString("hex"),
    replayNonce: replayNonce.toString("hex"), nullifier: nullifier.toString("hex"),
    validAfterSlot: validAfter, expiresAtSlot: expires,
  });
  const [acceptedIntent] = PublicKey.findProgramAddressSync([
    ACCEPTED_INTENT_SEED, mother.toBuffer(), u64(epochId), intentCommitment,
  ], TSN);
  const acceptedInfo = await getAccountInfoWithRetry(connection, acceptedIntent, "TSN accepted intent");
  if (!acceptedInfo) {
    const funding = deriveTsnFundingPdas({ motherEscrow: mother, epochId, tokenMint: mintKey });
    const associated = (owner, mint) => PublicKey.findProgramAddressSync([owner.toBuffer(), new PublicKey(process.env.TCAP_TOKEN_PROGRAM).toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];
    const funderTokenAccount = pk(process.env.TCAP_FUNDER_TOKEN_ACCOUNT ?? associated(payer.publicKey, mintKey), "TCAP_FUNDER_TOKEN_ACCOUNT");
    const treasuryTokenAccount = pk(process.env.TCAP_TREASURY_TOKEN_ACCOUNT ?? associated(funding.treasuryAuthority, mintKey), "TCAP_TREASURY_TOKEN_ACCOUNT");
    const funderInfo = await getAccountInfoWithRetry(connection, funderTokenAccount, "funder token account");
    if (!funderInfo) throw new Error(`MISSING_DEPENDENCY TCAP_FUNDER_TOKEN_ACCOUNT: ${funderTokenAccount.toBase58()} is not present; fund the fixture wallet with the governed mint first`);
    const balance = await connection.getTokenAccountBalance(funderTokenAccount, "confirmed");
    if (BigInt(balance.value.amount) < amount) throw new Error(`MISSING_DEPENDENCY TCAP_FUNDER_TOKEN_BALANCE: ${balance.value.amount} < requested ${amount}`);
    const atomic = buildFundAndAcceptIntentTransaction({
      payer: payer.publicKey, funder: payer.publicKey, authority: motherAuthority, motherEscrow: mother,
      epochId, amount, tokenMint: mintKey, funderTokenAccount, treasuryTokenAccount, acceptedIntent,
      intentCommitment, tokenId, tipRootCommitment: root, settlementCommitment,
      assetCommitment, policyCommitment: policy,
      gpruScopeCommitment, replayNonce, nullifier, validAfterSlot: validAfter, expiresAtSlot: expires,
    });
    atomic.feePayer = payer.publicKey;
    const signers = [payer, motherSigner].filter((signer, index, all) => all.findIndex((other) => other.publicKey.equals(signer.publicKey)) === index);
    const sig = await sendAndConfirmTransaction(connection, atomic, signers, { commitment: "confirmed" });
    console.log(`Created TSN AcceptedIntentV1 atomically with funding: ${acceptedIntent.toBase58()} tx=${sig}`);
    console.log(`Atomic instructions: tsn_fund_epoch_treasury + tsn_accept_intent; funder token account=${funderTokenAccount.toBase58()}`);
  } else {
    if (!acceptedInfo.owner.equals(TSN) || acceptedInfo.data.length < 334 || acceptedInfo.data.subarray(302, 334).toString("hex") !== acceptedIntentRoot) throw new Error("MISSING_DEPENDENCY TSN_ACCEPTED_INTENT_MISMATCH: existing record is not the canonical intent for this credit");
    console.log(`TSN AcceptedIntentV1: ${acceptedIntent.toBase58()} (reused)`);
  }
  const rootData = (await getAccountInfoWithRetry(connection, commitmentRoot, "TCAP commitment root")).data;
  const currentTcapRoot = rootData.subarray(12, 44).toString("hex");
  const previousTcapRoot = process.env.TCAP_PREVIOUS_TCAP_ROOT?.trim() ?? currentTcapRoot;
  if (!process.env.TCAP_PREVIOUS_TCAP_ROOT) console.log(`Derived TCAP previous root from commitment root account: ${previousTcapRoot}`);
  if (currentTcapRoot !== previousTcapRoot.toLowerCase()) throw new Error("MISSING_DEPENDENCY TCAP_PREVIOUS_TCAP_ROOT: value does not match TCAP commitment-root current_root");
  const balancesText = required("TCAP_TOKEN_BALANCES_JSON");
  let balances; try { balances = JSON.parse(balancesText); } catch { throw new Error("TCAP_TOKEN_BALANCES_JSON_invalid_json"); }
  if (!Array.isArray(balances) || !balances.length) throw new Error("TCAP_TOKEN_BALANCES_JSON must contain real owner balances; refusing an empty synthetic snapshot");
  const key = randomBytes(32);
  // The SDK validator requires new_commitment even though the commitment
  // preimage intentionally excludes it. Use a zero placeholder while
  // computing the digest; the returned digest is the real new commitment.
  const snapshot = { version: 1, sequence, previous_commitment: previous.toLowerCase(), new_commitment: "0".repeat(64), token_balances: balances.map((x) => ({ token_id: Number(x.token_id), native_amount: BigInt(x.native_amount), stable_units: BigInt(x.stable_units), stable_rate_version: Number(x.stable_rate_version) })), policy_commitment: policy.toLowerCase(), transition_nullifier: nullifier.toString("hex"), tsn_settlement_commitment: settlementCommitment.toString("hex"), created_at: BigInt(Math.floor(Date.now() / 1000)), encrypted_record_locator: `devnet:${payer.publicKey.toBase58()}:${Date.now()}` };
  const next = await computeTcapBalanceSnapshotCommitment(snapshot);
  const derivedAuthorizationDigest = deriveConfidentialAuthorizationDigest({
      version: 1, tsnProgramId: TSN, epochId, intentCommitment, amount,
      settlementCommitment, acceptedIntentRoot, previousTcapRoot, assetCommitment,
      verifierDomainVersion: 1, validAfterSlot: validAfter, expiresAtSlot: expires,
      replayNonce, tip, previousCommitment: previous, newCommitment: next,
      sequence, tokenId, policyCommitment: policy, gpruScopeCommitment, nullifier,
    });
  const authorizationDigest = process.env.TCAP_AUTHORIZATION_DIGEST?.trim()
    ? b32(process.env.TCAP_AUTHORIZATION_DIGEST, "TCAP_AUTHORIZATION_DIGEST")
    : derivedAuthorizationDigest;
  if (!authorizationDigest.equals(derivedAuthorizationDigest)) {
    throw new Error("TSN_CONFIDENTIAL_AUTHORIZATION_DIGEST_MISMATCH: supplied digest does not match canonical receipt fields");
  }
  if (!process.env.TCAP_AUTHORIZATION_DIGEST) console.log(`Derived canonical ConfidentialSettlement authorization digest: ${authorizationDigest.toString("hex")}`);
  const env = [
    `TCAP_PROGRAM_ID=${TCAP.toBase58()}`, `TSN_PROGRAM_ID=${TSN.toBase58()}`, `TCAP_EMPTY_TREE_ROOT_HEX=${(process.env.TCAP_EMPTY_TREE_ROOT_HEX ?? DEVNET_EMPTY_TREE_ROOT_HEX).toLowerCase()}`, `TSN_MOTHER_ESCROW=${mother.toBase58()}`, `TSN_EPOCH_COMMITMENT=${epoch.toBase58()}`,
    `TSN_MOTHER_AUTHORITY_WALLET=${process.env.TSN_MOTHER_AUTHORITY_WALLET ?? ""}`,
    `TCAP_CONFIG=${config.toBase58()}`, `TCAP_ASSET_REGISTRY=${registry.toBase58()}`, `TCAP_COMMITMENT_ROOT=${commitmentRoot.toBase58()}`, `TCAP_ASSET_ENTRY=${assetEntry.toBase58()}`, `TCAP_RESERVE_STATE=${reserve.toBase58()}`, `TCAP_TIP_ROOT_COMMITMENT=${root.toLowerCase()}`, `TCAP_TIP=${tip.toBase58()}`,
    `TCAP_ACCEPTED_INTENT=${acceptedIntent.toBase58()}`, `TCAP_ACCEPTED_INTENT_ROOT=${acceptedIntentRoot}`, `TCAP_INTENT_COMMITMENT=${intentCommitment.toString("hex")}`, `TCAP_AMOUNT=${amount}`, `TCAP_EPOCH_ID=${epochId}`,
    `TCAP_INITIAL_COMMITMENT=${previous.toLowerCase()}`, `TCAP_NEW_COMMITMENT=${next}`, `TCAP_POLICY_COMMITMENT=${policy.toLowerCase()}`, `TCAP_VALID_AFTER_SLOT=${validAfter}`, `TCAP_EXPIRES_AT_SLOT=${expires}`, `TCAP_SEQUENCE=${sequence}`,
    `TCAP_PREVIOUS_TCAP_ROOT=${previousTcapRoot.toLowerCase()}`,
    `TCAP_ASSET_COMMITMENT=${assetCommitment}`, `TCAP_AUTHORIZATION_DIGEST=${authorizationDigest.toString("hex")}`, `TCAP_NULLIFIER=${nullifier.toString("hex")}`, `TCAP_REPLAY_NONCE=${replayNonce.toString("hex")}`, `TCAP_GPRU_SCOPE_COMMITMENT=${gpruScopeCommitment.toString("hex")}`, `TCAP_TSN_SETTLEMENT_COMMITMENT=${settlementCommitment.toString("hex")}`, `TCAP_TOKEN_ID=${tokenId}`,
    `TCAP_SNAPSHOT_KEY_HEX=${key.toString("hex")}`, `TCAP_PRIVATE_SNAPSHOT_JSON=${JSON.stringify({ token_balances: balances, created_at: snapshot.created_at.toString(), encrypted_record_locator: snapshot.encrypted_record_locator })}`,
  ];
  const out = path.resolve("protocol-tests/tcap-credit-devnet.env"); fs.writeFileSync(out, `${env.join("\n")}\n`, { mode: 0o600 });
  console.log(`Wrote real Devnet credit env: ${out}`);
  console.log("No transaction was submitted for credit; register + credit remains the next explicit smoke step.");
}
main().catch((e) => { console.error(`BOOTSTRAP_FAILED: ${e.message}`); process.exitCode = 1; });
