import { createHash } from "node:crypto";
import { createPublicKey } from "node:crypto";
import { verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import type { ReceiverWork } from "../../work-contract";
import { receiptPublicKey } from "./receipt-public-key";
import { parseReceiptInstructions } from "./parse-receipt-instructions";
import { hash } from "./hash";
import { pda } from "./pda";
import { integer } from "./integer";
import { proofInputBytes } from "./proof-input-bytes";
import { bytes } from "./bytes";
import { assertPermissions } from "./assert-permissions";
import { matchesExpectedAccount } from "./matches-expected-account";
import { isMotherAuthority } from "./is-mother-authority";
import { assertTinDebitReceipt } from "./assert-tin-debit-receipt";
import { TSNP, TCAP, TIP, GPRU } from "./configuration";

/** assertSettlementReceipt component. Inputs and results retain the original settlement-reconciliation contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function assertSettlementReceipt(work: ReceiverWork, signature: string, receipt: any, mother: any, root: any, reportOwner?: string) {
  const t = work.authorization?.transition as Record<string, any>;
  const coordination = work.kind === "TCAP_EPOCH_ACCOUNTING";
  if (!t || (!coordination && !t.proof) || receipt?.meta?.err !== null || receipt.version !== 1 || !Number.isSafeInteger(receipt.slot)
      || !Array.isArray(receipt.transaction) || receipt.transaction[1] !== "base64") throw new Error("SETTLEMENT_RECEIPT_NOT_SUCCESSFUL_V1");
  if (work.result?.signature && work.result.signature !== signature) throw new Error("SETTLEMENT_SUBMISSION_SIGNATURE_MISMATCH");
  const wire = Buffer.from(receipt.transaction[0], "base64");
  if (wire.length > 4096 || wire[0] !== 0x81 || wire[1] !== 2 || wire.length < 170) throw new Error("SETTLEMENT_RECEIPT_INVALID_WIRE");
  const message = wire.subarray(0, -128);
  const mask = message.readUInt32LE(4), count = message[41];
  if (message[40] !== (coordination ? 1 : work.kind === "TIN_DEBIT" ? 3 : 2) || mask !== 12 || count < 2 || count > 96) throw new Error("SETTLEMENT_RECEIPT_INVALID_WIRE");
  const keys = Array.from({ length: count }, receiptPublicKey.bind(null, { message }));
  if ((reportOwner && keys[0].toBase58() !== reportOwner)
      || (work.result?.signature && (
      createHash("sha256").update(wire).digest("hex") !== work.result?.wireSha256
      || wire.length !== work.result?.wireBytes
      || new PublicKey(message.subarray(8, 40)).toBase58() !== work.result?.blockhash))) {
    throw new Error("SETTLEMENT_LATE_REPORT_SUBMISSION_MISMATCH");
  }
  let cursor = 42 + count * 32;
  if (message.readUInt32LE(cursor) !== 1_400_000 || message.readUInt32LE(cursor + 4) !== 64 * 1024 * 1024) throw new Error("SETTLEMENT_RECEIPT_INVALID_WIRE");
  cursor += 8;
  const parsed = parseReceiptInstructions(message, cursor, count, coordination ? 1 : work.kind === "TIN_DEBIT" ? 3 : 2, keys);
  const instructions = parsed.instructions;
  cursor = parsed.cursor;
  if (cursor !== message.length) throw new Error("SETTLEMENT_RECEIPT_INVALID_WIRE");
  // Signatures follow the message in V1. The chain lookup is keyed by the payer signature.
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n; for (const character of signature) { const digit = alphabet.indexOf(character); if (digit < 0) throw new Error("SETTLEMENT_RECEIPT_INVALID_SIGNATURE"); number = number * 58n + BigInt(digit); }
  const sig = Buffer.alloc(64); for (let i = 63; i >= 0; i--) { sig[i] = Number(number & 255n); number >>= 8n; }
  if (number || !sig.equals(wire.subarray(-128, -64))) throw new Error("SETTLEMENT_RECEIPT_INVALID_SIGNATURE");
  for (let i = 0; i < 2; i++) {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), keys[i].toBuffer()]), format: "der", type: "spki" });
    if (!verify(null, message, key, wire.subarray(message.length + i * 64, message.length + (i + 1) * 64))) throw new Error("SETTLEMENT_RECEIPT_INVALID_SIGNATURE");
  }
  const motherData = Buffer.from(mother?.data?.[0] ?? "", "base64");
  if (mother?.owner !== TSNP.toBase58() || !motherData.subarray(0, 8).equals(hash("account:MotherEscrow").subarray(0, 8))) throw new Error("SETTLEMENT_RECEIPT_INVALID_MOTHER");
  const authority = new PublicKey(motherData.subarray(8, 40));
  if (work.kind === "TIN_DEBIT") return assertTinDebitReceipt(t, signature, receipt.slot, message, keys, instructions, authority, root);
  if (coordination) {
    let expectedKeys: PublicKey[], expected: Buffer, stage: string;
      expectedKeys = [authority,pda("tsn_mother_escrow",TSNP),new PublicKey(t.tcapConfig),new PublicKey(t.assetEntry),new PublicKey(t.reserveState),new PublicKey(t.accountingEpoch),pda("gpru:tcap-epoch-verifier:v1",GPRU),GPRU];
      if (t.proof?.publicInputs?.length !== 5) throw new Error("TCAP_EPOCH_RECEIPT_PROOF_INVALID");
      expected = Buffer.concat([hash("global:account_credit_epoch_v1").subarray(0,8),integer(t.total,8),...t.proof.publicInputs.map(proofInputBytes),bytes(t.proof.proofA,64),bytes(t.proof.proofB,128),bytes(t.proof.proofC,64)]);
      const d = Buffer.from(root?.data?.[0] ?? "","base64");
      if (root?.owner !== TCAP.toBase58() || d.length !== 136 || !d.subarray(0,8).equals(hash("account:TcapCreditEpochV1").subarray(0,8)) || d[135] !== 1 || d.readUInt16LE(8)!==1 || !d.subarray(11,43).equals(new PublicKey(t.assetEntry).toBuffer())
          || !d.subarray(55,87).equals(bytes(t.proof.publicInputs[0],32)) || !d.subarray(87,119).equals(bytes(t.proof.publicInputs[1],32))
          || !bytes(t.proof.publicInputs[2],32).equals(Buffer.concat([Buffer.alloc(24),Buffer.from(integer(t.total,8)).reverse()]))
          || !bytes(t.proof.publicInputs[3],32).equals(Buffer.concat([Buffer.alloc(24),Buffer.from(d.subarray(119,127)).reverse()]))
          || !bytes(t.proof.publicInputs[4],32).equals(Buffer.concat([Buffer.alloc(28),Buffer.from(d.subarray(51,55)).reverse()]))
          || d.readBigUInt64LE(119)<2n || d.readBigUInt64LE(119)>64n || d.readUInt32LE(51)===0) throw new Error("TCAP_EPOCH_RECEIPT_MISMATCH");
      const [epoch,epochBump]=PublicKey.findProgramAddressSync([Buffer.from("tcap:credit-epoch:v1"),new PublicKey(t.assetEntry).toBuffer(),d.subarray(43,51)],TCAP);
      if(epoch.toBase58()!==t.accountingEpoch || d[10]!==epochBump)throw new Error("TCAP_EPOCH_RECEIPT_MISMATCH");
      stage = "TCAP_EPOCH_ACCOUNTING_V1_CONFIRMED";
    assertPermissions(keys, message, authority, expectedKeys, [expectedKeys[4], expectedKeys[5]], TCAP);
    if (!instructions[0].program.equals(TCAP) || !instructions[0].data.equals(expected) || instructions[0].keys.length !== expectedKeys.length || !instructions[0].keys.every(matchesExpectedAccount.bind(null, { expectedKeys }))) throw new Error("PRIVATE_COORDINATION_RECEIPT_AUTHORIZATION_MISMATCH");
    return {signature,stage,slot:receipt.slot,confirmationStatus:"finalized"};
  }
  const expectedKeys = [authority, pda("tsn_mother_escrow", TSNP), TCAP, TSNP,
    pda("tcap:global-config:v1", TCAP), new PublicKey(t.assetEntry), pda("tcap:commitment-root:v1", TCAP), new PublicKey(t.reserveState),
    PublicKey.findProgramAddressSync([Buffer.from("tsn:tcap-authorization:v1"), bytes(t.authorizationDigest, 32)], TSNP)[0],
    pda("tip:route-merkle-root:v1", TIP), pda("gpru:hidden-head-verifier:v1", GPRU),
    new PublicKey("Sysvar1nstructions1111111111111111111111111"), GPRU,
    pda("tcap:funding-root:v1", TCAP),
    new PublicKey(t.accountingEpoch), PublicKey.default];
  if (expectedKeys[6].toBase58() !== t.commitmentRoot || expectedKeys[4].toBase58() !== t.tcapConfig
      || expectedKeys[13].toBase58() !== t.fundingRootAccount) throw new Error("SETTLEMENT_RECEIPT_ACCOUNTS_MISMATCH");
  const proof = t.proof;
  if (!Array.isArray(proof.publicInputs) || proof.publicInputs.length !== 13) throw new Error("SETTLEMENT_RECONCILIATION_INVALID_TRANSITION");
  const expected = Buffer.concat([hash("global:tsn_register_tcap_credit_authorization_v3").subarray(0, 8), bytes(t.authorizationDigest, 32),
    integer(t.validAfterSlot, 8), integer(t.expiresAtSlot, 8), bytes(t.previousTcapRoot, 32), integer(t.tcapRootSequence, 8),
    integer(t.tokenId, 4), bytes(t.amountCommitment, 32), bytes(t.nullifier, 32), ...proof.publicInputs.map(proofInputBytes),
    bytes(proof.proofA, 64), bytes(proof.proofB, 128), bytes(proof.proofC, 64), integer(proof.actionKind, 1), integer(proof.tokenId, 4),
    bytes(proof.amountCommitment, 32), bytes(proof.authorizationCommitment, 32)]);
  assertPermissions(keys, message, authority, expectedKeys, [expectedKeys[6],expectedKeys[14]], TSNP,
    new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"));
  if (!instructions[0].program.equals(TSNP) || !instructions[0].data.equals(expected)
      || instructions[0].keys.length !== expectedKeys.length || !instructions[0].keys.every(matchesExpectedAccount.bind(null, { expectedKeys }))
      || !keys.slice(0, 2).some(isMotherAuthority.bind(null, { authority }))) throw new Error("SETTLEMENT_RECEIPT_AUTHORIZATION_MISMATCH");
  if (!instructions[1].program.equals(new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"))
      || instructions[1].keys.length !== 1 || !instructions[1].keys[0].equals(keys[0])
      || !instructions[1].data.equals(Buffer.from(String(t.memoPayload), "utf8"))) throw new Error("SETTLEMENT_RECEIPT_MEMO_MISMATCH");
  const rootData = Buffer.from(root?.data?.[0] ?? "", "base64");
  if (root?.owner !== TCAP.toBase58() || rootData.length !== 124 || !rootData.subarray(0, 8).equals(hash("account:TcapCommitmentRootStateV1").subarray(0, 8))
      || rootData.readBigUInt64LE(80) < BigInt(t.tcapRootSequence)) throw new Error("SETTLEMENT_RECEIPT_ROOT_MISMATCH");
  if (rootData.readBigUInt64LE(80) === BigInt(t.tcapRootSequence)
      && (!rootData.subarray(12, 44).equals(bytes(proof.publicInputs[1], 32)) || !rootData.subarray(44, 76).equals(bytes(t.previousTcapRoot, 32)))) throw new Error("SETTLEMENT_RECEIPT_ROOT_MISMATCH");
  return { signature, stage: "TCAP_GPRU_MEMO_CREDIT_V2_CONFIRMED", sequence: String(t.tcapRootSequence),
    authorizationDigest: String(t.authorizationDigest), slot: receipt.slot, confirmationStatus: "finalized" };
}
