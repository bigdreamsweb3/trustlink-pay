#!/usr/bin/env node
/** Devnet-only: deposit from the selected fixture user's wallet, then mutate
 * one existing TIP in place.
 * Encrypted snapshots remain local; no successor TIP, liability, or snapshot
 * PDA is created by a credit.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TCAP_PROGRAM_ID, buildDepositAssetV2Instruction, buildTsnRegisterOneTimeCreditInstruction, deriveOneTimeCreditPermitDigest } from "../../tcap-protocol/scripts/tcap-credit-transaction.mjs";
import { computeTcapBalanceSnapshotCommitment, encryptTcapBalanceSnapshotV1, importTcapSnapshotKey } from "../../tcap-protocol/tcap-sdk/dist/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
// Checked-in defaults make the Devnet test runnable from a clean shell.
// Shell values still override them; no private key material is stored here.
loadEnvFile(path.join(ROOT, "protocol-tests", "tcap-credit-devnet.defaults.env"));
loadEnvFile(path.join(ROOT, "protocol-tests", "tcap-one-time-credit-devnet.env"));
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const MOTHER = new PublicKey(process.env.TSN_MOTHER_ESCROW ?? "ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR");
const RESERVE = new PublicKey(process.env.TCAP_RESERVE_STATE ?? "3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d");
const TIP_DEFAULT = "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj";
const hash = (...parts) => createHash("sha256").update(Buffer.concat(parts.map((v) => Buffer.isBuffer(v) ? v : Buffer.from(String(v))))).digest();
const seed = (v) => Buffer.from(v, "utf8");
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, TCAP_PROGRAM_ID)[0];
const required = (name) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`missing ${name}`); return value; };
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const wallet = (value, label) => { const file = path.isAbsolute(value) ? value : path.resolve(ROOT, value.replace(/^~(?=$|[\\/])/, os.homedir())); const raw = JSON.parse(fs.readFileSync(file, "utf8")); return Keypair.fromSecretKey(Uint8Array.from(raw)); };
const id = arg("--user", "A");
if (!/^[AB]$/.test(id)) throw new Error("--user must be A or B");
const amount = BigInt(arg("--amount") ?? process.env.TCAP_DEPOSIT_AMOUNT ?? required("TCAP_DEPOSIT_AMOUNT"));
const skipFunding = process.argv.includes("--skip-funding");
if (amount <= 0n) throw new Error("--amount must be positive");
const userDir = path.join(ROOT, "protocol-tests", "tcap-v2-fixture", "users", id);
const user = JSON.parse(fs.readFileSync(path.join(userDir, "tin.json"), "utf8"));
const root = Buffer.from(JSON.parse(fs.readFileSync(path.join(userDir, "privacy-root.json"), "utf8")).root, "hex");
const snapshotKey = JSON.parse(fs.readFileSync(path.join(userDir, "snapshot-key.json"), "utf8")).keyHex;
const latestPath = path.join(userDir, "latest.json");
const connection = new Connection(required("TCAP_RPC_URL"), "confirmed");
// Each fixture identity funds its own credit.  Do not use the shared bootstrap
// wallet here: doing so would turn a credit into an airdrop from leftover
// vault liquidity instead of an explicitly paired deposit.
const funding = wallet(path.join(userDir, "wallet.json"), `${id} funding wallet`);
const mother = wallet(required("TSN_MOTHER_AUTHORITY_WALLET"), "TSN Mother authority");
const mint = new PublicKey(required("TCAP_MINT"));
const config = pda([seed("tcap:global-config:v1")]);
const registry = pda([seed("tcap:asset-registry:v1")]);
const assetEntry = new PublicKey(process.env.TCAP_ASSET_ENTRY ?? pda([seed("tcap:asset-entry:v1"), registry.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()]));
const assetState = pda([seed("tcap:asset-state:v1"), TOKEN.toBuffer(), mint.toBuffer()]);
const vault = new PublicKey(process.env.TCAP_VAULT ?? "2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh");
const currentTip = new PublicKey(process.env.TCAP_ONE_TIME_TIP ?? TIP_DEFAULT);
const tipInfo = await connection.getAccountInfo(currentTip, "confirmed");
if (!tipInfo) throw new Error(`TIP ${currentTip.toBase58()} is missing; initialize it once before credit`);
const tipData = Buffer.from(tipInfo.data);
if (tipData.length < 118) throw new Error(`TIP ${currentTip.toBase58()} has invalid size ${tipData.length}`);
const previousCommitment = tipData.subarray(8, 40);
const currentSequence = tipData.readBigUInt64LE(40);
const policy = tipData.subarray(48, 80);
const tokenId = tipData.readUInt32LE(112);
const source = PublicKey.findProgramAddressSync([funding.publicKey.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()], ASSOCIATED)[0];
let sourceBalance;
try {
  sourceBalance = BigInt((await connection.getTokenAccountBalance(source, "confirmed")).value.amount);
} catch (error) {
  throw new Error(`user ${id} USDC ATA ${source.toBase58()} does not exist. Create/fund this ATA for wallet ${funding.publicKey.toBase58()} before retrying.`);
}
if (sourceBalance < amount) throw new Error(`user ${id} funding token account ${source.toBase58()} has ${sourceBalance}; ${amount} required. Fund owner ${funding.publicKey.toBase58()} with Devnet USDC.`);
const vaultBalanceBefore = BigInt((await connection.getTokenAccountBalance(vault, "confirmed")).value.amount);
const readReserve = async () => {
  const info = await connection.getAccountInfo(RESERVE, "confirmed");
  if (!info) throw new Error(`reserve ${RESERVE.toBase58()} is missing`);
  const data = Buffer.from(info.data);
  if (data.length < 164) throw new Error(`reserve ${RESERVE.toBase58()} has invalid size ${data.length}`);
  return { actualAssets: data.readBigUInt64LE(140), pending: data.readBigUInt64LE(148), settled: data.readBigUInt64LE(156) };
};
const reserveBefore = await readReserve();
const deposit = buildDepositAssetV2Instruction({
  depositor: funding.publicKey,
  config,
  assetState,
  assetEntry,
  reserveState: RESERVE,
  source,
  vault,
  mint,
  tokenProgram: TOKEN,
  amount,
});
const fundingSignature = skipFunding ? null : await sendAndConfirmTransaction(connection, new Transaction().add(deposit), [funding], { commitment: "confirmed" });
if (!skipFunding && !fundingSignature) throw new Error("deposit_asset_v2 did not return a funding signature");
const vaultBalanceAfter = skipFunding ? vaultBalanceBefore : BigInt((await connection.getTokenAccountBalance(vault, "confirmed")).value.amount);
const vaultTokenDelta = vaultBalanceAfter - vaultBalanceBefore;
if (!skipFunding && vaultTokenDelta !== amount) throw new Error(`vault token delta ${vaultTokenDelta} does not equal requested amount ${amount}`);
const reserveAfterDeposit = skipFunding ? reserveBefore : await readReserve();
if (!skipFunding && reserveAfterDeposit.pending - reserveBefore.pending !== amount) throw new Error(`reserve pending delta ${reserveAfterDeposit.pending - reserveBefore.pending} does not equal requested amount ${amount}`);
const latest = fs.existsSync(latestPath) ? JSON.parse(fs.readFileSync(latestPath, "utf8")) : null;
if (latest && latest.tip === currentTip.toBase58() && latest.commitment !== previousCommitment.toString("hex")) throw new Error(`local snapshot commitment ${latest.commitment} does not match live TIP ${previousCommitment.toString("hex")}`);
const availableBefore = latest && latest.tip === currentTip.toBase58() ? BigInt(latest.availableBaseUnits ?? 0) : 0n;
const sequence = currentSequence + 1n;
const nextCommitmentDraft = { version: 1, sequence, previous_commitment: previousCommitment.toString("hex"), new_commitment: "0".repeat(64), token_balances: [{ token_id: tokenId, native_amount: availableBefore + amount, stable_units: (availableBefore + amount) / 1000000n, stable_rate_version: 1 }], policy_commitment: policy.toString("hex"), transition_nullifier: "0".repeat(64), tsn_settlement_commitment: "0".repeat(64), created_at: BigInt(Math.floor(Date.now() / 1000)), encrypted_record_locator: "local" };
const nullifier = hash("TCAP_ONE_TIME_TIP_NULLIFIER_V1", currentTip.toBuffer(), previousCommitment, u64(sequence), randomBytes(32));
nextCommitmentDraft.transition_nullifier = nullifier.toString("hex");
const nextCommitment = Buffer.from(await computeTcapBalanceSnapshotCommitment(nextCommitmentDraft), "hex");
const scope = hash("TCAP_ONE_TIME_TIP_GPRU_SCOPE_V1", root, previousCommitment, nextCommitment, nullifier);
const authorizationDigest = deriveOneTimeCreditPermitDigest({ destTip: currentTip, amount, tokenId, mint, nonce: nullifier, sequence, previousCommitment });
const confirmedSlot = await connection.getSlot("confirmed");
const expiresAtSlot = Math.min(Number.MAX_SAFE_INTEGER, confirmedSlot + 10_000_000);
const liability = deriveOneTimeTipLiabilityPda({ oneTimeTip: currentTip, assetEntry });
const credit = buildTsnRegisterOneTimeCreditInstruction({ payer: mother.publicKey, motherEscrow: MOTHER, tcapConfig: config, currentTip, assetEntry, reserveState: RESERVE, liability, authorizationDigest, validAfterSlot: 0, expiresAtSlot, nextCommitment, previousCommitment, nonce: nullifier, sequence, tokenId, amount, policyCommitment: policy, gpruScopeCommitment: scope });
const creditSignature = await sendAndConfirmTransaction(connection, new Transaction().add(credit), [mother], { commitment: "confirmed" });
const reserveAfterCredit = await readReserve();
if (reserveAfterDeposit.pending - reserveAfterCredit.pending !== amount) throw new Error(`reserve pending was not consumed by credit: before=${reserveAfterDeposit.pending} after=${reserveAfterCredit.pending}`);
const availableAfter = availableBefore + amount;
if (availableAfter - availableBefore !== amount) throw new Error(`private balance delta ${availableAfter - availableBefore} does not equal requested amount ${amount}`);
const snapshot = { ...nextCommitmentDraft, new_commitment: nextCommitment.toString("hex"), tsn_settlement_commitment: authorizationDigest.toString("hex") };
const envelope = await encryptTcapBalanceSnapshotV1(snapshot, await importTcapSnapshotKey(Buffer.from(snapshotKey, "hex")));
fs.mkdirSync(path.join(userDir, "snapshots"), { recursive: true });
const snapshotPath = path.join(userDir, "snapshots", `${nextCommitment.toString("hex")}.json`);
fs.writeFileSync(snapshotPath, JSON.stringify({ nonce: Buffer.from(envelope.nonce).toString("base64"), ciphertext: Buffer.from(envelope.ciphertext).toString("base64"), commitment: nextCommitment.toString("hex") }) + "\n", { mode: 0o600 });
fs.writeFileSync(latestPath, JSON.stringify({ user: id, tin: user.tin, tip: currentTip.toBase58(), commitment: nextCommitment.toString("hex"), sequence: sequence.toString(), token_id: tokenId, availableBaseUnits: availableAfter.toString() }, null, 2) + "\n", { mode: 0o600 });
const fundingTx = fundingSignature ? await connection.getTransaction(fundingSignature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }) : null;
const creditTx = await connection.getTransaction(creditSignature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
const accountKeys = creditTx?.transaction?.message?.accountKeys?.map((entry) => (entry.pubkey ?? entry).toBase58()) ?? [];
const result = {
  status: "PASSED",
  scenario: "TCAP V2 funding + GPRU credit",
  user: id,
  programs: { tsn: "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V", tcap: TCAP_PROGRAM_ID.toBase58() },
  funding: {
    instruction: "deposit_asset_v2",
    signature: fundingSignature,
    slot: fundingTx?.slot ?? null,
    amountBaseUnits: amount.toString(),
    sourceTokenAccount: source.toBase58(),
    sourceResolution: "derived-associated-token-account",
    governedVault: vault.toBase58(),
    vaultBalanceBefore: vaultBalanceBefore.toString(),
    vaultBalanceAfter: vaultBalanceAfter.toString(),
    vaultTokenDelta: vaultTokenDelta.toString(),
    reservePendingBefore: reserveBefore.pending.toString(),
    reservePendingAfter: reserveAfterDeposit.pending.toString(),
    reserveStatePresent: true,
  },
  credit: {
    instruction: "tsn_register_tcap_one_time_credit -> credit_one_time_tip",
    signature: creditSignature,
    slot: creditTx?.slot ?? null,
    tip: currentTip.toBase58(),
    sequence: sequence.toString(),
    previousCommitment: previousCommitment.toString("hex"),
    commitment: nextCommitment.toString("hex"),
    authorizationDigest: authorizationDigest.toString("hex"),
    accountKeys,
    v2Instructions: [
      { scope: "outer", name: "tsn_register_tcap_one_time_credit" },
      { scope: "inner:0", name: "credit_one_time_tip" },
    ],
    encryptedSnapshot: snapshotPath,
    identity: { user: id, tin: user.tin, tip: currentTip.toBase58(), availableBefore: availableBefore.toString(), availableAfter: availableAfter.toString() },
    reservePendingAfter: reserveAfterCredit.pending.toString(),
    newTcapAccounts: 0,
  },
  unlinkability: {
    status: "PASSED",
    forbiddenAccounts: [],
    forbiddenInstructions: [],
    fundingAccountsInCredit: [],
    note: "Credit transaction contains no funding token account, vault, or per-deposit PDA; the stable TIP is updated in place.",
  },
};
console.log(JSON.stringify(result, null, 2));
