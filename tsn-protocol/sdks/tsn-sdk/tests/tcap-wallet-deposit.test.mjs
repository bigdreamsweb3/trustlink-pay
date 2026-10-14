import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  buildTcapDepositAssetV2Instruction,
  buildTcapTinWalletDepositTransaction,
  TCAP_PROGRAM_ID,
} from "../dist/tcap-one-time-credit.js";

const key = (n) => new PublicKey(new Uint8Array(32).fill(n));

test("TCAP wallet deposit instruction matches deposit_asset_v2 ABI and account order", () => {
  const fields = {
    depositor: key(1), config: key(2), assetEntry: key(3),
    reserveState: key(4), source: key(5), vault: key(6), mint: key(7),
    tokenProgram: key(8), amount: 1_250_000n,
  };
  const instruction = buildTcapDepositAssetV2Instruction(fields);
  const discriminator = createHash("sha256").update("global:deposit_asset_v2").digest().subarray(0, 8);
  assert.equal(instruction.programId.toBase58(), TCAP_PROGRAM_ID.toBase58());
  assert.deepEqual(instruction.data.subarray(0, 8), discriminator);
  assert.equal(instruction.data.readBigUInt64LE(8), fields.amount);
  assert.deepEqual(instruction.keys.map(({ pubkey }) => pubkey.toBase58()), [
    fields.depositor, fields.config, fields.assetEntry,
    fields.reserveState, fields.source, fields.vault, fields.mint, fields.tokenProgram,
  ].map((value) => value.toBase58()));
  assert.equal(instruction.keys[0].isSigner, true);
  assert.equal(instruction.keys[4].isWritable, true);
  assert.equal(instruction.keys[5].isWritable, true);
  assert.equal(instruction.keys[6].isWritable, true);
});

test("first TIN deposit initializes its TIP before depositing; later deposits omit initialization", () => {
  const common = {
    depositor: key(1), blindedSettlementCommitment: "11".repeat(32),
    policyCommitment: "22".repeat(32), tokenId: 7, config: key(2),
    assetEntry: key(3), reserveState: key(4), source: key(5),
    vault: key(6), mint: key(7), tokenProgram: key(8), amount: 99n,
  };
  const first = buildTcapTinWalletDepositTransaction({ ...common, initializeTip: true });
  assert.equal(first.instructions.length, 2);
  assert.equal(first.instructions[0].programId.toBase58(), TCAP_PROGRAM_ID.toBase58());
  assert.equal(first.instructions[1].data.readBigUInt64LE(8), 99n);

  const later = buildTcapTinWalletDepositTransaction({ ...common, initializeTip: false });
  assert.equal(later.instructions.length, 1);
  assert.equal(later.instructions[0].data.readBigUInt64LE(8), 99n);
});

test("TCAP wallet deposit rejects zero and negative amounts", () => {
  const fields = {
    depositor: key(1), config: key(2), assetEntry: key(3),
    reserveState: key(4), source: key(5), vault: key(6), mint: key(7),
    tokenProgram: key(8), amount: 0n,
  };
  assert.throws(() => buildTcapDepositAssetV2Instruction(fields), /TCAP_DEPOSIT_AMOUNT_MUST_BE_POSITIVE/);
  assert.throws(() => buildTcapDepositAssetV2Instruction({ ...fields, amount: -1n }), /TCAP_DEPOSIT_AMOUNT_MUST_BE_POSITIVE/);
});
