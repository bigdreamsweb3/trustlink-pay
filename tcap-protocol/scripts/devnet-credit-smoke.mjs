import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  loadExistingRepoWallet,
  resolveExistingRepoRpc,
  deriveTcapPdas,
  buildTsnRegisterTcapCreditAuthorizationInstruction,
  buildCreditTcapTinTipInstruction,
} from "./tcap-credit-transaction.mjs";
import {
  computeTcapBalanceSnapshotCommitment,
  encryptTcapBalanceSnapshotV1,
  fetchTcapTinTipV1,
  importTcapSnapshotKey,
  readPrivateTcapBalance,
} from "../tcap-sdk/dist/index.js";

if (process.env.TCAP_ALLOW_LEGACY_V1 !== "1") {
  throw new Error("Legacy TCAP V1 credit smoke is disabled. Deploy and use the privacy-safe V2 GPRU credit path instead.");
}

const fail = (message) => { throw new Error(message); };
const TCAP_PROGRAM_ID = process.env.TCAP_PROGRAM_ID ?? "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x";
const REQUIRED_ENV = [
  "TSN_MOTHER_ESCROW", "TCAP_ASSET_ENTRY", "TCAP_RESERVE_STATE",
  "TCAP_TIP_ROOT_COMMITMENT", "TCAP_INITIAL_COMMITMENT", "TCAP_NEW_COMMITMENT",
  "TCAP_POLICY_COMMITMENT", "TCAP_AUTHORIZATION_DIGEST", "TCAP_NULLIFIER",
  "TCAP_ACCEPTED_INTENT_ROOT", "TCAP_ACCEPTED_INTENT", "TCAP_INTENT_COMMITMENT", "TCAP_AMOUNT",
  "TCAP_PREVIOUS_TCAP_ROOT", "TCAP_ASSET_COMMITMENT",
  "TCAP_REPLAY_NONCE", "TCAP_VALID_AFTER_SLOT", "TCAP_EXPIRES_AT_SLOT", "TCAP_TOKEN_ID",
  "TCAP_GPRU_SCOPE_COMMITMENT", "TCAP_TSN_SETTLEMENT_COMMITMENT", "TCAP_EPOCH_ID",
  "TCAP_SEQUENCE", "TCAP_SNAPSHOT_KEY_HEX", "TCAP_PRIVATE_SNAPSHOT_JSON",
];
const requireEnv = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) fail(`${name}_missing`);
  return value.trim();
};
const hex32 = (value, label) => {
  if (!/^[0-9a-f]{64}$/i.test(value ?? "")) fail(`${label}_must_be_32_byte_hex`);
  return value.toLowerCase();
};
const bytes32 = (value, label) => Buffer.from(hex32(value, label), "hex");
const publicKey = (value, label) => { try { return new PublicKey(value); } catch { fail(`${label}_invalid`); } };
function loadKeypair(value, label) {
  const file = value?.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
  if (!file) fail(`${label}_missing`);
  try { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")))); }
  catch { fail(`${label}_unreadable_or_invalid`); }
}
const discriminator = (name) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
const seed = (value) => Buffer.from(value, "utf8");

function reportMissingEnv() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (!missing.length) return;
  console.error("TCAP Devnet live credit is blocked: missing required environment values.");
  console.error(`TCAP_PROGRAM_ID=${TCAP_PROGRAM_ID}`);
  console.error("Missing checklist:");
  for (const name of missing) console.error(`  - ${name}`);
  console.error("Bootstrap the governed accounts first, then source the generated env file.");
  process.exit(2);
}

function buildInitializeTipInstruction({ payer, tipRoot, tip, initialCommitment, policyCommitment }) {
  return new TransactionInstruction({
    programId: new PublicKey(TCAP_PROGRAM_ID),
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: tip, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      discriminator("initialize_tcap_tin_tip_v1"),
      bytes32(tipRoot, "tipRootCommitment"),
      bytes32(initialCommitment, "initialCommitment"),
      bytes32(policyCommitment, "policyCommitment"),
    ]),
  });
}

reportMissingEnv();
const rpcUrl = resolveExistingRepoRpc();
const wallet = loadExistingRepoWallet();
const connection = new Connection(rpcUrl, "confirmed");
for (const name of [
  "TSN_MOTHER_ESCROW", "TCAP_ASSET_ENTRY", "TCAP_RESERVE_STATE",
  "TCAP_TIP_ROOT_COMMITMENT", "TCAP_INITIAL_COMMITMENT", "TCAP_NEW_COMMITMENT",
  "TCAP_POLICY_COMMITMENT", "TCAP_AUTHORIZATION_DIGEST", "TCAP_NULLIFIER",
  "TCAP_ACCEPTED_INTENT_ROOT", "TCAP_ACCEPTED_INTENT", "TCAP_INTENT_COMMITMENT", "TCAP_AMOUNT",
  "TCAP_PREVIOUS_TCAP_ROOT", "TCAP_ASSET_COMMITMENT",
  "TCAP_REPLAY_NONCE", "TCAP_EXPIRES_AT_SLOT", "TCAP_TOKEN_ID",
  "TCAP_GPRU_SCOPE_COMMITMENT", "TCAP_TSN_SETTLEMENT_COMMITMENT",
]) requireEnv(name);
const rootCommitment = hex32(process.env.TCAP_TIP_ROOT_COMMITMENT, "TCAP_TIP_ROOT_COMMITMENT");
const initialCommitment = hex32(process.env.TCAP_INITIAL_COMMITMENT, "TCAP_INITIAL_COMMITMENT");
const policyCommitment = hex32(process.env.TCAP_POLICY_COMMITMENT, "TCAP_POLICY_COMMITMENT");
const newCommitment = hex32(process.env.TCAP_NEW_COMMITMENT, "TCAP_NEW_COMMITMENT");
const authorizationDigest = hex32(process.env.TCAP_AUTHORIZATION_DIGEST, "TCAP_AUTHORIZATION_DIGEST");
const nullifier = hex32(process.env.TCAP_NULLIFIER, "TCAP_NULLIFIER");
const pdas = deriveTcapPdas({ tipRootCommitment: rootCommitment, authorizationDigest, nullifier });
const motherEscrow = publicKey(process.env.TSN_MOTHER_ESCROW, "TSN_MOTHER_ESCROW");
const motherInfo = await connection.getAccountInfo(motherEscrow, "confirmed");
if (!motherInfo || motherInfo.data.length < 40) fail("TSN_MOTHER_ESCROW_authority_unreadable");
const motherAuthority = new PublicKey(motherInfo.data.subarray(8, 40));
const motherSigner = loadKeypair(process.env.TSN_MOTHER_AUTHORITY_WALLET, "TSN_MOTHER_AUTHORITY_WALLET");
if (!motherSigner.publicKey.equals(motherAuthority)) fail(`TSN_MOTHER_AUTHORITY_MISMATCH: configured signer ${motherSigner.publicKey.toBase58()} does not match Mother authority ${motherAuthority.toBase58()}`);
for (const [label, value] of [
  ["TSN_MOTHER_ESCROW", process.env.TSN_MOTHER_ESCROW],
  ["TCAP_ASSET_ENTRY", process.env.TCAP_ASSET_ENTRY],
  ["TCAP_RESERVE_STATE", process.env.TCAP_RESERVE_STATE],
]) {
  const address = publicKey(value, label);
  if (!(await connection.getAccountInfo(address))) fail(`${label}_account_not_found`);
}
const existingTip = await connection.getAccountInfo(pdas.tip);
if (!existingTip) {
  const init = buildInitializeTipInstruction({ payer: wallet, tipRoot: rootCommitment, tip: pdas.tip, initialCommitment, policyCommitment });
  await sendAndConfirmTransaction(connection, new Transaction().add(init), [wallet], { commitment: "confirmed" });
}

const fields = {
  payer: wallet.publicKey,
  motherEscrow,
  assetEntry: publicKey(process.env.TCAP_ASSET_ENTRY, "TCAP_ASSET_ENTRY"),
  reserveState: publicKey(process.env.TCAP_RESERVE_STATE, "TCAP_RESERVE_STATE"),
  tip: pdas.tip,
  tipRootCommitment: rootCommitment,
  epochId: BigInt(process.env.TCAP_EPOCH_ID ?? "0"),
  acceptedIntent: publicKey(process.env.TCAP_ACCEPTED_INTENT, "TCAP_ACCEPTED_INTENT"),
  intentCommitment: hex32(process.env.TCAP_INTENT_COMMITMENT, "TCAP_INTENT_COMMITMENT"),
  amount: BigInt(process.env.TCAP_AMOUNT),
  acceptedIntentRoot: hex32(process.env.TCAP_ACCEPTED_INTENT_ROOT, "TCAP_ACCEPTED_INTENT_ROOT"),
  previousTcapRoot: hex32(process.env.TCAP_PREVIOUS_TCAP_ROOT, "TCAP_PREVIOUS_TCAP_ROOT"),
  assetCommitment: hex32(process.env.TCAP_ASSET_COMMITMENT, "TCAP_ASSET_COMMITMENT"),
  settlementCommitment: hex32(process.env.TCAP_TSN_SETTLEMENT_COMMITMENT, "TCAP_TSN_SETTLEMENT_COMMITMENT"),
  authorizationDigest,
  verifierDomainVersion: 1,
  validAfterSlot: BigInt(process.env.TCAP_VALID_AFTER_SLOT ?? "0"),
  expiresAtSlot: BigInt(process.env.TCAP_EXPIRES_AT_SLOT),
  replayNonce: hex32(process.env.TCAP_REPLAY_NONCE, "TCAP_REPLAY_NONCE"),
  previousCommitment: initialCommitment,
  newCommitment,
  sequence: BigInt(process.env.TCAP_SEQUENCE ?? "1"),
  tokenId: Number(process.env.TCAP_TOKEN_ID),
  policyCommitment,
  gpruScopeCommitment: hex32(process.env.TCAP_GPRU_SCOPE_COMMITMENT, "TCAP_GPRU_SCOPE_COMMITMENT"),
  nullifier,
  tsnSettlementCommitment: hex32(process.env.TCAP_TSN_SETTLEMENT_COMMITMENT, "TCAP_TSN_SETTLEMENT_COMMITMENT"),
};
const credit = buildCreditTcapTinTipInstruction(fields);
// The two instructions do not fit in one legacy Solana transaction. Register
// the TSN authorization first, then submit the dependent TCAP credit.
const registerTransaction = new Transaction().add(buildTsnRegisterTcapCreditAuthorizationInstruction({ ...fields, payer: motherSigner.publicKey }));
registerTransaction.feePayer = wallet.publicKey;
const registerSignature = await sendAndConfirmTransaction(connection, registerTransaction, [wallet, motherSigner], { commitment: "confirmed" });
console.log(`Registered TSN TCAP credit authorization: ${registerSignature}`);
const creditTransaction = new Transaction().add(credit);
creditTransaction.feePayer = wallet.publicKey;
const creditSignature = await sendAndConfirmTransaction(connection, creditTransaction, [wallet], { commitment: "confirmed" });
console.log(`Submitted TCAP credit: ${creditSignature}`);

const snapshotInput = JSON.parse(process.env.TCAP_PRIVATE_SNAPSHOT_JSON ?? "{}");
const snapshot = {
  version: 1,
  sequence: fields.sequence,
  previous_commitment: initialCommitment,
  new_commitment: newCommitment,
  token_balances: (snapshotInput.token_balances ?? []).map((balance) => ({
    token_id: Number(balance.token_id),
    native_amount: BigInt(balance.native_amount),
    stable_units: BigInt(balance.stable_units),
    stable_rate_version: Number(balance.stable_rate_version),
  })),
  policy_commitment: policyCommitment,
  transition_nullifier: nullifier,
  tsn_settlement_commitment: fields.tsnSettlementCommitment,
  created_at: BigInt(snapshotInput.created_at ?? Math.floor(Date.now() / 1000)),
  encrypted_record_locator: String(snapshotInput.encrypted_record_locator ?? "enc:local-devnet:v1"),
};
const computed = await computeTcapBalanceSnapshotCommitment(snapshot);
if (computed !== newCommitment) fail("snapshot_commitment_does_not_match_authorized_credit");
const key = await importTcapSnapshotKey(Buffer.from(process.env.TCAP_SNAPSHOT_KEY_HEX ?? "", "hex"));
const envelope = await encryptTcapBalanceSnapshotV1(snapshot, key);
const storeDir = path.resolve(process.env.TCAP_SNAPSHOT_STORE_DIR ?? ".tcap-snapshots");
fs.mkdirSync(storeDir, { recursive: true });
fs.writeFileSync(path.join(storeDir, `${newCommitment}.json`), JSON.stringify({ ...envelope, sequence: envelope.sequence.toString(), created_at: envelope.created_at.toString(), nonce: Buffer.from(envelope.nonce).toString("base64"), ciphertext: Buffer.from(envelope.ciphertext).toString("base64") }));
const tip = await fetchTcapTinTipV1({ rpcUrl, address: pdas.tip.toBase58(), expectedProgramId: TCAP_PROGRAM_ID });
await readPrivateTcapBalance({
  fetchTip: async () => tip,
  key,
  store: { load: async () => envelope },
});
console.log("TCap Devnet credit smoke test succeeded");
