import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { assertSignedTcapGpruWalletDepositTransaction, buildTcapGpruWalletDepositTransaction, GPRU_TCAP_PROGRAM_ID } from "../dist/tcap-gpru-credit.js";
import { createFundingNoteV1 } from "../dist/gpru/funding-note.js";

const wallet = Keypair.fromSeed(new Uint8Array(32).fill(1));
const key = n => new PublicKey(new Uint8Array(32).fill(n));
const fields = {
  accounts: { depositor: wallet.publicKey, config: key(2), assetEntry: key(3), reserveState: key(4), source: key(5),
    vault: key(6), mint: key(7), tokenProgram: key(8), tcapProgramId: GPRU_TCAP_PROGRAM_ID,
    fundingRootAccount: PublicKey.findProgramAddressSync([Buffer.from("tcap:funding-root:v1")], GPRU_TCAP_PROGRAM_ID)[0] },
  amountBaseUnits: 1000n, fundingNoteCommitment: createFundingNoteV1().commitment,
};
function signedWire(change = () => {}) {
  const transaction = buildTcapGpruWalletDepositTransaction(fields);
  transaction.recentBlockhash = key(9).toBase58();
  change(transaction);
  transaction.sign(wallet);
  return transaction.serialize();
}

test("signed funding accepts the exact deposit and wallet compute-budget settings without rewriting bytes", () => {
  for (const budget of [[], [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10n }),
    ComputeBudgetProgram.requestHeapFrame({ bytes: 64 * 1024 }),
    new TransactionInstruction({ programId: ComputeBudgetProgram.programId, keys: [], data: Buffer.from([4, 0, 0, 0, 4]) })]]) {
    const wire = signedWire(transaction => transaction.instructions.unshift(...budget));
    const original = Buffer.from(wire);
    assertSignedTcapGpruWalletDepositTransaction(wire, fields);
    assert.deepEqual(wire, original);
  }
});

test("signed funding rejects old deposits, substituted approval fields and extra account-changing instructions", () => {
  const changes = [
    transaction => transaction.instructions[0].data.writeBigUInt64LE(1001n, 8),
    transaction => transaction.instructions[0].data.fill(1, 16),
    transaction => transaction.instructions[0].keys[4].pubkey = key(10),
    transaction => transaction.instructions[0].data.fill(1, 0, 8),
    transaction => transaction.add(transaction.instructions[0]),
    transaction => transaction.add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: key(10), lamports: 1 })),
  ];
  for (const change of changes) assert.throws(() => assertSignedTcapGpruWalletDepositTransaction(signedWire(change), fields), /TCAP_SIGNED_DEPOSIT_/);
});

test("signed funding rejects unsigned/tampered wires and malformed or duplicate compute settings", () => {
  const tampered = signedWire(); tampered[1] ^= 1;
  assert.throws(() => assertSignedTcapGpruWalletDepositTransaction(tampered, fields), /OWNER_SIGNATURE_INVALID/);
  assert.throws(() => assertSignedTcapGpruWalletDepositTransaction(new Uint8Array(), fields), /WIRE_INVALID/);
  assert.throws(() => assertSignedTcapGpruWalletDepositTransaction(Buffer.concat([signedWire(), Buffer.from([0])]), fields), /WIRE_INVALID/);
  for (const budget of [
    [ComputeBudgetProgram.setComputeUnitLimit({ units: 0 })],
    [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 })],
    [new TransactionInstruction({ programId: ComputeBudgetProgram.programId, keys: [], data: Buffer.from([2]) })],
    [new TransactionInstruction({ programId: ComputeBudgetProgram.programId, keys: [], data: Buffer.from([0, 0, 0, 0, 0]) })],
    [new TransactionInstruction({ programId: ComputeBudgetProgram.programId, keys: [{ pubkey: key(10), isSigner: false, isWritable: true }], data: Buffer.from([2, 1, 0, 0, 0]) })],
  ]) assert.throws(() => assertSignedTcapGpruWalletDepositTransaction(signedWire(transaction => transaction.add(...budget)), fields), /TCAP_SIGNED_DEPOSIT_/);
});

test("clean SDK builds exclude the retired generated TIN-credit adapter", () => {
  assert.equal(existsSync(new URL("../dist/tin-credit.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../dist/tin-credit.d.ts", import.meta.url)), false);
});
