import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createHash } from "node:crypto";
import test from "node:test";
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
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const RPC = process.env.TCAP_RPC_URL ?? "https://api.devnet.solana.com";
const MINT = new PublicKey(process.env.TCAP_TEST_MINT ?? "9ZqZ4fLxzSedkoZfUFYVXrbezNUbf41KxU9N5i6R92PK");
const SOURCE = new PublicKey(process.env.TCAP_TEST_SOURCE ?? "563tkShWJf3VKttQTeUEAAdfkUfzX2DrZztQVSHDunPy");
const walletPath = process.env.SOLANA_WALLET ?? `${os.homedir()}/.config/solana/id.json`;
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
const connection = new Connection(RPC, "confirmed");
const seed = (value) => Buffer.from(value, "utf8");
const discriminator = (namespace, name) => createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8);
const instructionDiscriminator = (name) => discriminator("global", name);
const depositEventDiscriminator = discriminator("event", "AssetDepositAcceptedV1");

const [config] = PublicKey.findProgramAddressSync([seed("tcap:global-config:v1")], PROGRAM_ID);
const [registry] = PublicKey.findProgramAddressSync([seed("tcap:asset-registry:v1")], PROGRAM_ID);
const [assetEntry] = PublicKey.findProgramAddressSync(
  [seed("tcap:asset-entry:v1"), registry.toBytes(), TOKEN_PROGRAM_ID.toBytes(), MINT.toBytes()],
  PROGRAM_ID,
);
const [reserveState] = PublicKey.findProgramAddressSync([seed("tcap:reserve-state:v1"), assetEntry.toBytes()], PROGRAM_ID);
const [reserveAuthority] = PublicKey.findProgramAddressSync([seed("tcap:reserve-authority:v1"), assetEntry.toBytes()], PROGRAM_ID);
const [vault] = PublicKey.findProgramAddressSync([seed("tcap:future-vault:v1"), assetEntry.toBytes()], PROGRAM_ID);

function u64(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

function depositInstruction({
  depositor = payer.publicKey,
  depositorIsSigner = true,
  configAccount = config,
  assetAccount = assetEntry,
  reserveAccount = reserveState,
  sourceAccount = SOURCE,
  vaultAccount = vault,
  mintAccount = MINT,
  tokenProgram = TOKEN_PROGRAM_ID,
  amount = 1n,
} = {}) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: depositor, isSigner: depositorIsSigner, isWritable: false },
      { pubkey: configAccount, isSigner: false, isWritable: false },
      { pubkey: assetAccount, isSigner: false, isWritable: false },
      { pubkey: reserveAccount, isSigner: false, isWritable: true },
      { pubkey: sourceAccount, isSigner: false, isWritable: true },
      { pubkey: vaultAccount, isSigner: false, isWritable: true },
      { pubkey: mintAccount, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([instructionDiscriminator("deposit_asset_v1"), u64(amount)]),
  });
}

function policyInstruction(enabled, governance = payer.publicKey, vaultAccount = vault) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: governance, isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: assetEntry, isSigner: false, isWritable: true },
      { pubkey: reserveState, isSigner: false, isWritable: true },
      { pubkey: vaultAccount, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([instructionDiscriminator("set_asset_deposit_policy_v1"), Buffer.from([enabled ? 1 : 0])]),
  });
}

function statusInstruction(status, risk, governance = payer.publicKey) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: governance, isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: assetEntry, isSigner: false, isWritable: true },
      { pubkey: registry, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([instructionDiscriminator("update_asset_status_v1"), Buffer.from([status, risk])]),
  });
}

function initializeVaultInstruction() {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: assetEntry, isSigner: false, isWritable: false },
      { pubkey: reserveState, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: reserveAuthority, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionDiscriminator("initialize_reserve_vault_v1"),
  });
}

function tokenTransferCheckedInstruction(authority, destination, amount = 1n) {
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([12]), u64(amount), Buffer.from([2])]),
  });
}

async function send(ix, signers = [payer]) {
  return sendAndConfirmTransaction(connection, new Transaction().add(ix), signers, { commitment: "confirmed" });
}

async function reserveSnapshot() {
  const [sourceBalance, vaultBalance, reserveInfo] = await Promise.all([
    connection.getTokenAccountBalance(SOURCE),
    connection.getTokenAccountBalance(vault),
    connection.getAccountInfo(reserveState),
  ]);
  assert.ok(reserveInfo, "reserve state must exist");
  return {
    source: BigInt(sourceBalance.value.amount),
    vault: BigInt(vaultBalance.value.amount),
    actualAssets: reserveInfo.data.readBigUInt64LE(108),
  };
}

async function assetPolicyState() {
  const [assetInfo, reserveInfo] = await Promise.all([
    connection.getAccountInfo(assetEntry),
    connection.getAccountInfo(reserveState),
  ]);
  assert.ok(assetInfo && reserveInfo, "asset and reserve accounts must exist");
  return {
    depositsEnabled: assetInfo.data[241] === 1,
    assetPaused: assetInfo.data[243] === 1,
    status: assetInfo.data[279],
    risk: assetInfo.data[280],
    fundingEnabled: reserveInfo.data[156] === 1,
    reservePaused: reserveInfo.data[157] === 1,
  };
}

async function assertReserveInvariant() {
  const snapshot = await reserveSnapshot();
  assert.equal(snapshot.actualAssets, snapshot.vault, "reserve.actual_assets must equal canonical vault amount");
  return snapshot;
}

function containsDepositEvent(logs = []) {
  return logs.some((line) => {
    if (!line.startsWith("Program data: ")) return false;
    return Buffer.from(line.slice("Program data: ".length), "base64").subarray(0, 8).equals(depositEventDiscriminator);
  });
}

async function expectRejected(name, ix, signers = [payer]) {
  const before = await reserveSnapshot();
  let logs = [];
  await assert.rejects(async () => {
    try {
      await send(ix, signers);
    } catch (error) {
      logs = error.transactionLogs ?? [];
      throw error;
    }
  }, name);
  const after = await reserveSnapshot();
  assert.deepEqual(after, before, `${name}: rejected transaction must not mutate balances/accounting`);
  assert.equal(containsDepositEvent(logs), false, `${name}: rejected transaction must not emit deposit event`);
  await assertReserveInvariant();
}

async function ensureActiveAndEnabled() {
  await send(statusInstruction(1, 1)); // Active, Approved; status update disables deposits.
  await send(policyInstruction(true));
  const state = await assetPolicyState();
  assert.deepEqual(
    { depositsEnabled: state.depositsEnabled, fundingEnabled: state.fundingEnabled, reservePaused: state.reservePaused },
    { depositsEnabled: true, fundingEnabled: true, reservePaused: false },
  );
}

function decodeDepositEvent(logs) {
  for (const line of logs ?? []) {
    if (!line.startsWith("Program data: ")) continue;
    const data = Buffer.from(line.slice("Program data: ".length), "base64");
    if (!data.subarray(0, 8).equals(depositEventDiscriminator)) continue;
    let offset = 8;
    const version = data.readUInt16LE(offset);
    offset += 2;
    const readKey = () => {
      const key = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;
      return key;
    };
    const event = {
      version,
      assetEntry: readKey(),
      reserveState: readKey(),
      mint: readKey(),
      vault: readKey(),
      source: readKey(),
      depositor: readKey(),
      amount: data.readBigUInt64LE(offset),
      actualAssets: data.readBigUInt64LE(offset + 8),
      accountingEpoch: data.readBigUInt64LE(offset + 16),
    };
    return event;
  }
  throw new Error("AssetDepositAcceptedV1 event not found");
}

test("fixture uses canonical reserve relationships and invariant", async () => {
  const [vaultBalance, vaultInfo] = await Promise.all([
    connection.getTokenAccountBalance(vault),
    connection.getParsedAccountInfo(vault),
  ]);
  assert.equal(vaultBalance.value.decimals, 2);
  assert.equal(vaultInfo.value?.data.parsed.info.mint, MINT.toBase58());
  assert.equal(vaultInfo.value?.data.parsed.info.owner, reserveAuthority.toBase58());
  await assertReserveInvariant();
});

test("duplicate canonical reserve-vault initialization fails atomically", async () => {
  await expectRejected("duplicate vault initialization", initializeVaultInstruction());
});

test("authorized governance enables deposits and unpauses reserve", async () => {
  await ensureActiveAndEnabled();
});

test("successful deposit moves exact value, updates accounting, and emits reserve-only event", async () => {
  const before = await reserveSnapshot();
  const signature = await send(depositInstruction({ amount: 100n }));
  const after = await reserveSnapshot();
  assert.equal(after.source, before.source - 100n);
  assert.equal(after.vault, before.vault + 100n);
  assert.equal(after.actualAssets, before.actualAssets + 100n);
  await assertReserveInvariant();
  const transaction = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const event = decodeDepositEvent(transaction?.meta?.logMessages);
  assert.equal(event.version, 1);
  assert.equal(event.assetEntry.toBase58(), assetEntry.toBase58());
  assert.equal(event.reserveState.toBase58(), reserveState.toBase58());
  assert.equal(event.mint.toBase58(), MINT.toBase58());
  assert.equal(event.vault.toBase58(), vault.toBase58());
  assert.equal(event.source.toBase58(), SOURCE.toBase58());
  assert.equal(event.depositor.toBase58(), payer.publicKey.toBase58());
  assert.equal(event.amount, 100n);
  assert.equal(event.actualAssets, after.actualAssets);
});

test("multiple deposits preserve reserve invariant after each deposit", async () => {
  await send(depositInstruction({ amount: 101n }));
  await assertReserveInvariant();
  await send(depositInstruction({ amount: 102n }));
  await assertReserveInvariant();
});

test("disable rejects deposit without mutation and re-enable restores deposits", async () => {
  await send(policyInstruction(false));
  const disabled = await assetPolicyState();
  assert.equal(disabled.depositsEnabled, false);
  assert.equal(disabled.fundingEnabled, false);
  assert.equal(disabled.reservePaused, true);
  await expectRejected("deposits disabled", depositInstruction({ amount: 1n }));
  await send(policyInstruction(true));
  await send(depositInstruction({ amount: 103n }));
  await assertReserveInvariant();
});

test("asset inactive rejects deposit and state restoration preserves invariant", async () => {
  await send(statusInstruction(2, 2)); // DepositsPaused, Restricted
  await expectRejected("asset inactive", depositInstruction({ amount: 1n }));
  await ensureActiveAndEnabled();
});

test("zero amount is rejected atomically", async () => {
  await expectRejected("zero amount", depositInstruction({ amount: 0n }));
});

test("insufficient source balance is rejected atomically", async () => {
  const snapshot = await reserveSnapshot();
  await expectRejected("insufficient source balance", depositInstruction({ amount: snapshot.source + 1n }));
});

test("wrong mint is rejected atomically", async () => {
  await expectRejected("wrong mint", depositInstruction({ mintAccount: SystemProgram.programId }));
});

test("wrong token program is rejected atomically", async () => {
  await expectRejected("wrong token program", depositInstruction({ tokenProgram: SystemProgram.programId }));
});

test("Token-2022 substitution is rejected atomically", async () => {
  await expectRejected("Token-2022", depositInstruction({ tokenProgram: TOKEN_2022_PROGRAM_ID }));
});

test("wrong source owner is rejected atomically", async () => {
  await expectRejected("wrong source owner", depositInstruction({ sourceAccount: vault }));
});

test("missing depositor signature is rejected atomically", async () => {
  const attacker = Keypair.generate();
  await expectRejected(
    "missing depositor signature",
    depositInstruction({ depositor: attacker.publicKey, depositorIsSigner: false }),
  );
});

test("wrong reserve metadata is rejected atomically", async () => {
  await expectRejected("wrong reserve metadata", depositInstruction({ reserveAccount: assetEntry }));
});

test("substituted reserve vault is rejected even with correct mint", async () => {
  await expectRejected("substituted vault", depositInstruction({ vaultAccount: SOURCE }));
});

test("wrong asset entry PDA is rejected atomically", async () => {
  await expectRejected("substituted asset PDA", depositInstruction({ assetAccount: config }));
});

test("wrong config PDA is rejected atomically", async () => {
  await expectRejected("substituted config PDA", depositInstruction({ configAccount: registry }));
});

test("unauthorized governance cannot change deposit policy", async () => {
  const attacker = Keypair.generate();
  await expectRejected("unauthorized governance", policyInstruction(false, attacker.publicKey), [payer, attacker]);
});

test("governance cannot redirect policy to a fake vault", async () => {
  await expectRejected("policy vault substitution", policyInstruction(true, payer.publicKey, SOURCE));
});

for (const role of ["arbitrary wallet", "Cranker-like signer", "TSN-like signer"]) {
  test(`${role} cannot withdraw reserve assets`, async () => {
    const attacker = Keypair.generate();
    await expectRejected(role, tokenTransferCheckedInstruction(attacker.publicKey, SOURCE), [payer, attacker]);
  });
}

test("final reserve invariant holds", async () => {
  await ensureActiveAndEnabled();
  await assertReserveInvariant();
});
