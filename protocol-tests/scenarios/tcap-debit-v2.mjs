#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TSN_PROGRAM_ID,
  TCAP_PROGRAM_ID,
  buildTsnRegisterTcapDebitAuthorizationV2Instruction,
  deriveGpruTcapDebitAuthorizationDigest,
  deriveTcapTipLiabilityV2,
  deriveTcapPdas,
  deriveGpruTcapDebitTransitionFields,
} from "../../tcap-protocol/scripts/tcap-credit-transaction.mjs";
import {
  computeTcapBalanceSnapshotCommitment,
  decryptTcapBalanceSnapshotV1,
  importTcapSnapshotKey,
} from "../../tcap-protocol/tcap-sdk/dist/index.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURE_USER = path.join(REPO_ROOT, "protocol-tests", "tcap-v2-fixture", "user.json");
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const DEFAULT_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const DEFAULT_MOTHER_ESCROW = "ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR";
const FORBIDDEN = new Set([
  "AcceptedIntent", "EpochCommitmentState", "EpochTreasury", "EpochSettlementLedger",
  "TsnAuthorizationReceipt", "NullifierRecord", "TcapCommitmentRootState", "TcapPaymentIntent",
  "TsnPaymentIntent", "TinAccount", "TinRoute", "PrivacyReceivingUnit", "ZkPru",
  "FundingRoot", "FundingClaim", "FundingAuthorizationNonce",
]);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = raw.trim().match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
}
loadEnv(path.join(REPO_ROOT, ".env"));
loadEnv(path.join(REPO_ROOT, ".env.local"));
loadEnv(path.join(REPO_ROOT, "protocol-tests", "tcap-credit-devnet.defaults.env"));
// The credit fixture writes the owner-authorized snapshot key and metadata to
// this local, protected env file. Never print its values; only use them to
// decrypt the matching envelope on this machine.
loadEnv(path.join(REPO_ROOT, "protocol-tests", "tcap-credit-devnet.env"));

const env = (name) => process.env[name]?.trim() || undefined;
const fail = (message) => { throw new Error(`[tcap-debit-v2] ${message}`); };
const pda = (program, ...parts) => PublicKey.findProgramAddressSync(parts.map((p) => Buffer.isBuffer(p) ? p : Buffer.from(p)), program)[0];

function key(value, label) { try { return new PublicKey(value); } catch { fail(`${label} is not a valid Solana public key`); } }
function hex(value, label) { if (!/^[0-9a-fA-F]{64}$/.test(value ?? "")) fail(`${label} must be exactly 64 hexadecimal characters`); return Buffer.from(value, "hex"); }
function u64(value, label) { let n; try { n = BigInt(value); } catch { fail(`${label} must be an unsigned integer`); } if (n <= 0n || n > 0xffffffffffffffffn) fail(`${label} is outside the positive u64 range`); return n; }
function wallet() {
  const configured = env("TSN_MOTHER_AUTHORITY_WALLET") ?? env("SOLANA_WALLET") ?? "~/.config/solana/id.json";
  const expanded = configured.replace(/^~(?=$|[\\/])/, os.homedir());
  const file = path.isAbsolute(expanded) ? expanded : path.resolve(REPO_ROOT, expanded);
  try { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")))); } catch { fail(`cannot read signer keypair at ${file}`); }
}
function accountData(info, label) { if (!info) fail(`${label} is missing`); return Buffer.from(info.data); }
function graph(data, label) {
  if (data.length < 244) fail(`${label} has an unexpected account layout`);
  return { reserve: new PublicKey(data.subarray(148, 180)), vault: new PublicKey(data.subarray(180, 212)), authority: new PublicKey(data.subarray(212, 244)) };
}
function tokenId(data, label) {
  if (data.length < 48) fail(`${label} has an unexpected account layout`);
  return data.readUInt32LE(44);
}
function stateGraph(data, label) {
  if (data.length < 204) fail(`${label} has an unexpected account layout`);
  return { reserve: new PublicKey(data.subarray(108, 140)), vault: new PublicKey(data.subarray(140, 172)), authority: new PublicKey(data.subarray(172, 204)) };
}
function liabilityState(info) {
  const data = accountData(info, "TCAP tip liability");
  if (data.length < 91) fail("TCAP tip liability has an unexpected layout");
  return { available: data.readBigUInt64LE(74), spent: data.readBigUInt64LE(82) };
}
function tipState(info) {
  const data = accountData(info, "TCAP tip");
  if (data.length < 115) fail("TCAP tip has an unexpected layout");
  return { previousCommitment: data.subarray(10, 42), sequence: data.readBigUInt64LE(42), policyCommitment: data.subarray(50, 82), nullifier: data.subarray(82, 114), frozen: data[114] !== 0 };
}
function loadEnvelope(commitment) {
  const dir = path.resolve(REPO_ROOT, env("TCAP_SNAPSHOT_STORE_DIR") ?? ".tcap-snapshots");
  const file = path.join(dir, `${commitment}.json`);
  if (!fs.existsSync(file)) fail(`encrypted snapshot for live tip commitment ${commitment} is missing at ${file}`);
  let value; try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail(`encrypted snapshot ${file} is not valid JSON`); }
  if (value.token_balances) fail("snapshot store exposed plaintext balances; refusing to continue");
  try {
    return {
      ...value,
      sequence: BigInt(value.sequence), created_at: BigInt(value.created_at),
      nonce: Uint8Array.from(Buffer.from(value.nonce, "base64")),
      ciphertext: Uint8Array.from(Buffer.from(value.ciphertext, "base64")),
    };
  } catch { fail(`encrypted snapshot ${file} has invalid envelope fields`); }
}
function fixtureSnapshotKey() {
  if (!fs.existsSync(FIXTURE_USER)) return undefined;
  try { return JSON.parse(fs.readFileSync(FIXTURE_USER, "utf8")).snapshotKeyHex; } catch { fail("fixture user.json is not valid JSON"); }
}
function writeEnvelope(dir, commitment, envelope) {
  fs.mkdirSync(dir, { recursive: true });
  const value = { ...envelope, sequence: envelope.sequence.toString(), created_at: envelope.created_at.toString(), nonce: Buffer.from(envelope.nonce).toString("base64"), ciphertext: Buffer.from(envelope.ciphertext).toString("base64") };
  fs.writeFileSync(path.join(dir, `${commitment}.json`), `${JSON.stringify(value)}\n`, { mode: 0o600 });
}
function allKeys(tx) { return [...(tx.transaction.message.staticAccountKeys ?? tx.transaction.message.accountKeys ?? []), ...(tx.meta?.loadedAddresses?.writable ?? []), ...(tx.meta?.loadedAddresses?.readonly ?? [])].map((k) => k.toBase58()); }

async function main() {
  const rpc = env("TCAP_RPC_URL") ?? env("TSN_RPC_URL") ?? env("ANCHOR_PROVIDER_URL") ?? "https://api.devnet.solana.com";
  if (!/^https?:\/\//i.test(rpc) || !/devnet/i.test(rpc)) fail("RPC must be a Solana Devnet URL");
  const signer = wallet();
  const motherEscrow = key(env("TSN_MOTHER_ESCROW") ?? DEFAULT_MOTHER_ESCROW, "TSN_MOTHER_ESCROW");
  const mint = key(env("TCAP_MINT") ?? DEFAULT_MINT, "TCAP_MINT");
  const tokenProgram = key(env("TCAP_TOKEN_PROGRAM") ?? TOKEN.toBase58(), "TCAP_TOKEN_PROGRAM");
  if (!tokenProgram.equals(TOKEN)) fail("this Devnet runner supports classic SPL Token only");
  const rootHex = env("TCAP_SOURCE_TIP_ROOT") ?? env("TCAP_TIP_ROOT_COMMITMENT");
  const tipRootCommitment = hex(rootHex, "TCAP_SOURCE_TIP_ROOT");
  const connection = new Connection(rpc, "confirmed");
  const registry = pda(TCAP_PROGRAM_ID, "tcap:asset-registry:v1");
  const assetEntry = key(env("TCAP_ASSET_ENTRY") ?? pda(TCAP_PROGRAM_ID, "tcap:asset-entry:v1", registry.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()).toBase58(), "TCAP_ASSET_ENTRY");
  const assetState = pda(TCAP_PROGRAM_ID, "tcap:asset-state:v1", tokenProgram.toBuffer(), mint.toBuffer());
  const tip = pda(TCAP_PROGRAM_ID, "tcap:tin-tip:v1", tipRootCommitment);
  const liability = deriveTcapTipLiabilityV2({ tip, assetEntry });
  const [entryInfo, stateInfo, tipInfo, liabilityInfo] = await connection.getMultipleAccountsInfo([assetEntry, assetState, tip, liability], "confirmed");
  if (!entryInfo?.owner.equals(TCAP_PROGRAM_ID) || !stateInfo?.owner.equals(TCAP_PROGRAM_ID)) fail("TCAP asset entry or asset state is missing or not owned by TCAP");
  const entryBytes = accountData(entryInfo, "asset entry");
  const entry = graph(entryBytes, "asset entry");
  const assetTokenId = tokenId(entryBytes, "asset entry");
  const state = stateGraph(accountData(stateInfo, "asset state"), "asset state");
  if (!entry.reserve.equals(state.reserve) || !entry.vault.equals(state.vault) || !entry.authority.equals(state.authority)) fail(`TCAP custody graph is split; entry reserve=${entry.reserve.toBase58()} vault=${entry.vault.toBase58()} but state reserve=${state.reserve.toBase58()} vault=${state.vault.toBase58()}`);
  if (!liabilityInfo?.owner.equals(TCAP_PROGRAM_ID)) fail(`V2 liability ${liability.toBase58()} is missing; initialize it before debit`);
  const before = liabilityState(liabilityInfo);
  const tipBefore = tipState(tipInfo);
  if (tipBefore.frozen) fail("source tip is frozen");
  const amount = u64(env("TCAP_DEBIT_AMOUNT") ?? env("TCAP_AMOUNT"), "TCAP_DEBIT_AMOUNT");
  if (before.available < amount) fail(`liability has only ${before.available} base units available; requested ${amount}`);
  const currentCommitment = tipBefore.previousCommitment.toString("hex");
  const envelope = loadEnvelope(currentCommitment);
  const snapshotKeyHex = env("TCAP_SNAPSHOT_KEY_HEX") ?? fixtureSnapshotKey();
  if (!snapshotKeyHex) fail("TCAP_SNAPSHOT_KEY_HEX is required to decrypt the matching private snapshot");
  let snapshot; try {
    const key = await importTcapSnapshotKey(Buffer.from(snapshotKeyHex, "hex"));
    snapshot = await decryptTcapBalanceSnapshotV1(envelope, key);
  } catch (error) { fail(`cannot decrypt/verify snapshot for live tip: ${error.message}`); }
  if (snapshot.new_commitment !== currentCommitment || snapshot.sequence !== tipBefore.sequence || snapshot.policy_commitment !== tipBefore.policyCommitment.toString("hex")) fail("snapshot/tip mismatch (commitment, sequence, or policy)");
  const token = Number(env("TCAP_TOKEN_ID") ?? assetTokenId);
  const balanceIndex = snapshot.token_balances.findIndex((balance) => Number(balance.token_id) === token);
  if (balanceIndex < 0) fail(`snapshot has no balance for token_id ${token}; refusing an unbound debit`);
  if (snapshot.token_balances[balanceIndex].native_amount < amount) fail(`private snapshot balance is below debit amount ${amount}`);
  const successorBalances = snapshot.token_balances.map((balance, index) => index === balanceIndex ? { ...balance, native_amount: balance.native_amount - amount } : balance);
  const sequence = tipBefore.sequence + 1n;
  const provisional = { ...snapshot, sequence, previous_commitment: currentCommitment, new_commitment: "0".repeat(64), token_balances: successorBalances, transition_nullifier: "0".repeat(64), tsn_settlement_commitment: "0".repeat(64), created_at: BigInt(Math.floor(Date.now() / 1000)), encrypted_record_locator: `${snapshot.encrypted_record_locator}:debit:${sequence}` };
  const transition = deriveGpruTcapDebitTransitionFields({ tip, previousCommitment: tipBefore.previousCommitment, sequence, tokenId: token, policyCommitment: tipBefore.policyCommitment, debitAmount: amount, newCommitment: Buffer.alloc(32) });
  provisional.transition_nullifier = transition.nullifier.toString("hex");
  provisional.tsn_settlement_commitment = transition.settlementCommitment.toString("hex");
  const newCommitment = hex(await computeTcapBalanceSnapshotCommitment(provisional), "derived new commitment");
  const scope = transition.gpruScopeCommitment;
  const nullifier = transition.nullifier;
  const validAfterSlot = await connection.getSlot("confirmed");
  const expiresAtSlot = validAfterSlot + Number(env("TCAP_DEBIT_SLOT_WINDOW") ?? "150");
  const fields = { payer: signer.publicKey, motherEscrow, assetEntry, reserveState: state.reserve, tipRootCommitment, previousCommitment: tipBefore.previousCommitment, newCommitment, sequence, tokenId: token, policyCommitment: tipBefore.policyCommitment, gpruScopeCommitment: scope, nullifier, debitAmount: amount, validAfterSlot, expiresAtSlot };
  fields.authorizationDigest = deriveGpruTcapDebitAuthorizationDigest({ tip, validAfterSlot, expiresAtSlot, previousCommitment: fields.previousCommitment, newCommitment, sequence: fields.sequence, tokenId: fields.tokenId, policyCommitment: fields.policyCommitment, gpruScopeCommitment: scope, nullifier, debitAmount: amount });
  const ix = buildTsnRegisterTcapDebitAuthorizationV2Instruction(fields);
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [signer], { commitment: "confirmed" });
  const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const keys = allKeys(tx);
  const pdas = deriveTcapPdas({ tipRootCommitment, authorizationDigest: fields.authorizationDigest, nullifier });
  const allowed = new Set([signer.publicKey, motherEscrow, TCAP_PROGRAM_ID, TSN_PROGRAM_ID, pdas.config, assetEntry, pdas.tipRoot, pdas.tip, state.reserve, liability, pdas.tsnAuthorizationSigner, SystemProgram.programId].map((address) => address.toBase58()));
  const forbidden = keys.filter((address) => !allowed.has(address));
  if (forbidden.length) fail(`debit transaction contains accounts outside the V2 allowlist: ${forbidden.join(", ")}`);
  const afterInfo = await connection.getAccountInfo(liability, "confirmed");
  const after = liabilityState(afterInfo);
  const snapshotCryptoKey = await importTcapSnapshotKey(Buffer.from(snapshotKeyHex, "hex"));
  const persisted = await (await import("../../tcap-protocol/tcap-sdk/dist/index.js")).encryptTcapBalanceSnapshotV1({ ...provisional, new_commitment: newCommitment }, snapshotCryptoKey);
  writeEnvelope(path.resolve(REPO_ROOT, env("TCAP_SNAPSHOT_STORE_DIR") ?? ".tcap-snapshots"), newCommitment.toString("hex"), persisted);
  console.log(JSON.stringify({ status: "PASSED", instruction: "tsn_register_tcap_debit_authorization_v2 -> debit_tcap_gpru_tip_v2", signature, tip: tip.toBase58(), liability: liability.toBase58(), reserve: state.reserve.toBase58(), vault: state.vault.toBase58(), availableBefore: before.available.toString(), availableAfter: after.available.toString(), spentBefore: before.spent.toString(), spentAfter: after.spent.toString(), forbiddenAccounts: forbidden }, null, 2));
}
main().catch((error) => { console.error(JSON.stringify({ status: "FAILED", scenario: "TCAP V2 debit-only", error: error.message }, null, 2)); process.exitCode = 1; });
