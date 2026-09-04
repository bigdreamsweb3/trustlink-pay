import { createHash } from "node:crypto";
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

export const TCAP_PROGRAM_ID = new PublicKey(process.env.TCAP_PROGRAM_ID ?? "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x");
export const TSN_PROGRAM_ID = new PublicKey(process.env.TSN_PROGRAM_ID ?? "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
const seed = (value) => Buffer.from(value, "utf8");
const digest = (value) => createHash("sha256").update(value).digest();
const discriminator = (name) => digest(`global:${name}`).subarray(0, 8);
const bytes32 = (value, label) => {
  const bytes = Buffer.isBuffer(value) || value instanceof Uint8Array ? Buffer.from(value) : Buffer.from(value, "hex");
  if (bytes.length !== 32) throw new Error(`${label} must be 32 bytes`);
  return bytes;
};
const pubkey = (value) => value instanceof PublicKey ? value : new PublicKey(value);
const u16 = (value) => { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; };
const u32 = (value) => { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; };
const u64 = (value) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; };
const concat = (...parts) => Buffer.concat(parts);
const REPLAY_NONCE_DOMAIN = seed("TSN_CONFIDENTIAL_SETTLEMENT_REPLAY_NONCE_V1");
const GPRU_SCOPE_DOMAIN = seed("TSN_CONFIDENTIAL_SETTLEMENT_GPRU_SCOPE_V1");
const SETTLEMENT_COMMITMENT_DOMAIN = seed("TSN_CONFIDENTIAL_SETTLEMENT_COMMITMENT_V1");
const NULLIFIER_DOMAIN = seed("TSN_CONFIDENTIAL_SETTLEMENT_NULLIFIER_V1");
const AUTHORIZATION_DIGEST_DOMAIN = seed("TSN_CONFIDENTIAL_SETTLEMENT_AUTHORIZATION_V1");
const AUTHORIZATION_V2_DOMAIN = seed("TSN_GPRU_TCAP_CREDIT_V2");
const DEBIT_AUTHORIZATION_V2_DOMAIN = seed("TSN_GPRU_TCAP_DEBIT_V2");
const DEBIT_SCOPE_V2_DOMAIN = seed("TSN_GPRU_TCAP_DEBIT_SCOPE_V2");
const DEBIT_NULLIFIER_V2_DOMAIN = seed("TSN_GPRU_TCAP_DEBIT_NULLIFIER_V2");
const DEBIT_SETTLEMENT_V2_DOMAIN = seed("TSN_GPRU_TCAP_DEBIT_SETTLEMENT_V2");

// These seeds must match the deployed TSN Rust constants exactly.
const TSN_EPOCH_TREASURY_SEED = seed("tsn_epoch_treasury");
const TSN_EPOCH_LEDGER_SEED = seed("tsn_epoch_ledger");
const TSN_EPOCH_TREASURY_AUTHORITY_SEED = seed("tsn_epoch_treasury_authority");
const TSN_MOTHER_ESCROW_SEED = seed("tsn_mother_escrow");
const TSN_ACCEPTED_INTENT_SEED = seed("tsn:accepted-intent:v1");

export function deriveTsnFundingPdas({ motherEscrow, epochId, tokenMint }) {
  const mother = pubkey(motherEscrow);
  const mint = pubkey(tokenMint);
  const epochTreasury = PublicKey.findProgramAddressSync([
    TSN_EPOCH_TREASURY_SEED, mother.toBuffer(), u64(epochId), mint.toBuffer(),
  ], TSN_PROGRAM_ID)[0];
  const epochLedger = PublicKey.findProgramAddressSync([
    TSN_EPOCH_LEDGER_SEED, epochTreasury.toBuffer(),
  ], TSN_PROGRAM_ID)[0];
  const treasuryAuthority = PublicKey.findProgramAddressSync([
    TSN_EPOCH_TREASURY_AUTHORITY_SEED, epochTreasury.toBuffer(),
  ], TSN_PROGRAM_ID)[0];
  return { epochTreasury, epochLedger, treasuryAuthority };
}

export function deriveAcceptedIntentPda({ motherEscrow, epochId, intentCommitment }) {
  return PublicKey.findProgramAddressSync([
    TSN_ACCEPTED_INTENT_SEED, pubkey(motherEscrow).toBuffer(), u64(epochId),
    bytes32(intentCommitment, "intentCommitment"),
  ], TSN_PROGRAM_ID)[0];
}

export function deriveConfidentialSettlementFields(fields) {
  const intent = bytes32(fields.intentCommitment, "intentCommitment");
  const tipRoot = bytes32(fields.tipRootCommitment, "tipRootCommitment");
  const policy = bytes32(fields.policyCommitment, "policyCommitment");
  const replay = bytes32(fields.replayNonce, "replayNonce");
  const gpruScope = digest(concat(
    GPRU_SCOPE_DOMAIN, u64(fields.epochId), intent, u64(fields.amount), u32(fields.tokenId),
    tipRoot, policy, replay, u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
  ));
  const nullifier = digest(concat(NULLIFIER_DOMAIN, u64(fields.epochId), intent, tipRoot, replay));
  const settlement = digest(concat(
    SETTLEMENT_COMMITMENT_DOMAIN, u64(fields.epochId), intent, u64(fields.amount), u32(fields.tokenId),
    tipRoot, bytes32(fields.assetCommitment, "assetCommitment"), policy, gpruScope, replay, nullifier,
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
  ));
  return { gpruScopeCommitment: gpruScope, nullifier, settlementCommitment: settlement };
}

export function deriveConfidentialReplayNonce(fields) {
  return digest(concat(
    REPLAY_NONCE_DOMAIN, u64(fields.epochId), u64(fields.amount), u32(fields.tokenId),
    pubkey(fields.tokenMint).toBuffer(), bytes32(fields.tipRootCommitment, "tipRootCommitment"),
    bytes32(fields.policyCommitment, "policyCommitment"), u64(fields.validAfterSlot),
    u64(fields.expiresAtSlot),
  ));
}

export function deriveConfidentialAuthorizationDigest(fields) {
  return digest(concat(
    AUTHORIZATION_DIGEST_DOMAIN, u16(fields.version ?? 1), pubkey(fields.tsnProgramId ?? TSN_PROGRAM_ID).toBuffer(),
    u64(fields.epochId), bytes32(fields.intentCommitment, "intentCommitment"), u64(fields.amount),
    bytes32(fields.settlementCommitment, "settlementCommitment"), bytes32(fields.acceptedIntentRoot, "acceptedIntentRoot"),
    bytes32(fields.previousTcapRoot, "previousTcapRoot"), Buffer.from([1]), bytes32(fields.assetCommitment, "assetCommitment"),
    u16(fields.verifierDomainVersion ?? 1), u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
    bytes32(fields.replayNonce, "replayNonce"), pubkey(fields.tip).toBuffer(),
    bytes32(fields.previousCommitment, "previousCommitment"), bytes32(fields.newCommitment, "newCommitment"),
    u64(fields.sequence), u32(fields.tokenId), bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"), bytes32(fields.nullifier, "nullifier"),
  ));
}

/** Digest for the privacy-safe GPRU/TCAP transition. It deliberately excludes
 * payment intent, amount, settlement, epoch, and per-transfer receipt data. */
export function deriveGpruTcapCreditAuthorizationDigest(fields) {
  return digest(concat(
    AUTHORIZATION_V2_DOMAIN,
    pubkey(fields.tip).toBuffer(),
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
    bytes32(fields.previousCommitment, "previousCommitment"),
    bytes32(fields.newCommitment, "newCommitment"),
    u64(fields.sequence), u32(fields.tokenId),
    bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"),
    bytes32(fields.nullifier, "nullifier"),
  ));
}

/** Exact permit message checked by TCap's in-place one-time credit. */
export function deriveOneTimeCreditPermitDigest(fields) {
  return digest(concat(
    seed("TCAP_ONE_TIME_CREDIT_PERMIT_V1"),
    pubkey(fields.destTip ?? fields.tip).toBuffer(),
    u64(fields.amount),
    u32(fields.tokenId),
    pubkey(fields.mint).toBuffer(),
    bytes32(fields.nonce ?? fields.nullifier, "nonce"),
    u64(fields.sequence),
    bytes32(fields.previousCommitment, "previousCommitment"),
  ));
}

export function deriveOneTimeTransferCreditPermitDigest(fields) {
  return digest(concat(
    seed("TCAP_ONE_TIME_TRANSFER_CREDIT_PERMIT_V1"),
    pubkey(fields.destTip ?? fields.tip).toBuffer(),
    u64(fields.amount), u32(fields.tokenId), pubkey(fields.mint).toBuffer(),
    bytes32(fields.nonce ?? fields.nullifier, "nonce"), u64(fields.sequence),
    bytes32(fields.previousCommitment, "previousCommitment"),
  ));
}

export function deriveGpruTcapDebitAuthorizationDigest(fields) {
  return digest(concat(DEBIT_AUTHORIZATION_V2_DOMAIN, pubkey(fields.tip).toBuffer(), u64(fields.validAfterSlot), u64(fields.expiresAtSlot), bytes32(fields.previousCommitment, "previousCommitment"), bytes32(fields.newCommitment, "newCommitment"), u64(fields.sequence), u32(fields.tokenId), bytes32(fields.policyCommitment, "policyCommitment"), bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"), bytes32(fields.nullifier, "nullifier"), u64(fields.debitAmount)));
}

/** Deterministic, domain-separated V2 transition material. These helpers bind
 * the private snapshot successor to the live tip transition without exposing
 * funding, TIN, route, or legacy receipt identifiers. */
export function deriveGpruTcapDebitTransitionFields(fields) {
  const common = concat(pubkey(fields.tip).toBuffer(), bytes32(fields.previousCommitment, "previousCommitment"), u64(fields.sequence), u32(fields.tokenId), bytes32(fields.policyCommitment, "policyCommitment"), u64(fields.debitAmount));
  // Nullifier derivation is independent of the successor hash, avoiding a
  // circular preimage while still binding the live tip, sequence and amount.
  const nullifier = digest(concat(DEBIT_NULLIFIER_V2_DOMAIN, common));
  const gpruScopeCommitment = digest(concat(DEBIT_SCOPE_V2_DOMAIN, common, bytes32(nullifier, "nullifier")));
  const settlementCommitment = digest(concat(DEBIT_SETTLEMENT_V2_DOMAIN, common, bytes32(gpruScopeCommitment, "gpruScopeCommitment"), bytes32(nullifier, "nullifier")));
  return { gpruScopeCommitment, nullifier, settlementCommitment };
}

export function deriveTcapTipLiabilityV2({ tip, assetEntry }) {
  return PublicKey.findProgramAddressSync([seed("tcap:tip-liability:v2"), pubkey(tip).toBuffer(), pubkey(assetEntry).toBuffer()], TCAP_PROGRAM_ID)[0];
}

export function buildTsnRegisterTcapDebitAuthorizationV2Instruction(fields) {
  const pdas = deriveTcapPdas({ tipRootCommitment: fields.tipRootCommitment, authorizationDigest: fields.authorizationDigest, nullifier: fields.nullifier });
  const liability = deriveTcapTipLiabilityV2({ tip: pdas.tip, assetEntry: fields.assetEntry });
  const data = concat(discriminator("tsn_register_tcap_debit_authorization_v2"), bytes32(fields.authorizationDigest, "authorizationDigest"), u64(fields.validAfterSlot), u64(fields.expiresAtSlot), bytes32(fields.previousCommitment, "previousCommitment"), bytes32(fields.newCommitment, "newCommitment"), u64(fields.sequence), u32(fields.tokenId), bytes32(fields.policyCommitment, "policyCommitment"), bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"), bytes32(fields.nullifier, "nullifier"), u64(fields.debitAmount));
  return new TransactionInstruction({ programId: TSN_PROGRAM_ID, keys: [
    { pubkey: pubkey(fields.payer), isSigner: true, isWritable: true },
    { pubkey: pubkey(fields.motherEscrow), isSigner: false, isWritable: false },
    { pubkey: TCAP_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: pdas.config, isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
    { pubkey: pdas.tipRoot, isSigner: false, isWritable: false },
    { pubkey: pdas.tip, isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.reserveState), isSigner: false, isWritable: true },
    { pubkey: liability, isSigner: false, isWritable: true },
    { pubkey: pdas.tsnAuthorizationSigner, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data });
}

/** Debit a one-time TIP in place. The TSN wrapper invokes debit_tcap_balance_v1;
 * no destination TIP, ATA, vault, or funding account is included. */
export function buildTsnRegisterTcapBalanceDebitAuthorizationInstruction(fields) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const tip = pubkey(fields.currentTip ?? fields.tip);
  const [signer] = PublicKey.findProgramAddressSync([seed("tsn:tcap-authorization:v1"), auth], TSN_PROGRAM_ID);
  const data = concat(discriminator("tsn_register_tcap_debit_authorization_v2"), auth,
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot), bytes32(fields.previousCommitment, "previousCommitment"),
    bytes32(fields.newCommitment, "newCommitment"), u64(fields.sequence), u32(fields.tokenId),
    bytes32(fields.policyCommitment, "policyCommitment"), bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"),
    bytes32(fields.nullifier, "nullifier"), u64(fields.debitAmount));
  // Keep this list byte-for-byte aligned with RegisterTcapDebitAuthorizationV2:
  // authority, mother_escrow, tcap_program, tsn_program, tcap_config,
  // tcap_asset_entry, tin_tip, reserve_state, liability,
  // tcap_authorization_signer, system_program.
  const systemProgram = SystemProgram.programId;
  return new TransactionInstruction({ programId: TSN_PROGRAM_ID, keys: [
    { pubkey: pubkey(fields.payer), isSigner: true, isWritable: true },
    { pubkey: pubkey(fields.motherEscrow), isSigner: false, isWritable: false },
    { pubkey: TCAP_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.tcapConfig), isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
    { pubkey: tip, isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.reserveState), isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.liability), isSigner: false, isWritable: true },
    { pubkey: signer, isSigner: false, isWritable: false },
    { pubkey: systemProgram, isSigner: false, isWritable: false },
  ], data });
}

/** Build the privacy-safe TCAP tip credit. No intent, epoch, receipt, or
 * per-transfer nullifier account is included in this instruction. */
export function buildCreditTcapTinTipV2Instruction(fields) {
  const pdas = deriveTcapPdas({ tipRootCommitment: fields.tipRootCommitment, authorizationDigest: fields.authorizationDigest, nullifier: fields.nullifier });
  const data = concat(
    discriminator("credit_tcap_tin_tip_v2"),
    bytes32(fields.authorizationDigest, "authorizationDigest"),
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
    bytes32(fields.previousCommitment, "previousCommitment"),
    bytes32(fields.newCommitment, "newCommitment"),
    u64(fields.sequence), u32(fields.tokenId),
    bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"),
    bytes32(fields.nullifier, "nullifier"),
  );
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: pubkey(fields.payer), isSigner: true, isWritable: true },
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pdas.tip, isSigner: false, isWritable: true },
      { pubkey: pdas.tipRoot, isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
      { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: pdas.tsnAuthorizationSigner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

/** TSN CPI wrapper for V2. The wrapper carries only opaque tip-transition
 * material and never passes AcceptedIntent, epoch, receipt, or nullifier PDAs. */
export function buildTsnRegisterTcapCreditAuthorizationV2Instruction(fields) {
  const pdas = deriveTcapPdas({ tipRootCommitment: fields.tipRootCommitment, authorizationDigest: fields.authorizationDigest, nullifier: fields.nullifier });
  const data = concat(
    discriminator("tsn_register_tcap_credit_authorization_v2"),
    bytes32(fields.authorizationDigest, "authorizationDigest"),
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
    bytes32(fields.previousCommitment, "previousCommitment"),
    bytes32(fields.newCommitment, "newCommitment"),
    u64(fields.sequence), u32(fields.tokenId),
    bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"),
    bytes32(fields.nullifier, "nullifier"),
  );
  return new TransactionInstruction({
    programId: TSN_PROGRAM_ID,
    keys: [
      { pubkey: pubkey(fields.payer), isSigner: true, isWritable: true },
      { pubkey: pubkey(fields.motherEscrow), isSigner: false, isWritable: false },
      { pubkey: TCAP_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
      { pubkey: pdas.tipRoot, isSigner: false, isWritable: false },
      { pubkey: pdas.tip, isSigner: false, isWritable: true },
      { pubkey: pdas.tsnAuthorizationSigner, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Funding and acceptance are added to one atomic Transaction. Funder and
 * Mother authority may be different signers; the caller must sign with both. */
export function buildFundEpochTreasuryInstruction(fields) {
  if (BigInt(fields.amount) <= 0n) throw new Error("funding amount must be positive");
  const funder = pubkey(fields.funder ?? fields.payer);
  const pdas = deriveTsnFundingPdas(fields);
  return new TransactionInstruction({
    programId: TSN_PROGRAM_ID,
    keys: [
      { pubkey: funder, isSigner: true, isWritable: true },
      { pubkey: pubkey(fields.motherEscrow), isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.funderTokenAccount), isSigner: false, isWritable: true },
      { pubkey: pubkey(fields.tokenMint), isSigner: false, isWritable: false },
      { pubkey: pdas.epochTreasury, isSigner: false, isWritable: true },
      { pubkey: pdas.epochLedger, isSigner: false, isWritable: true },
      { pubkey: pdas.treasuryAuthority, isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.treasuryTokenAccount), isSigner: false, isWritable: true },
      { pubkey: pubkey(fields.associatedTokenProgram ?? "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.tokenProgram ?? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concat(discriminator("tsn_fund_epoch_treasury"), u64(fields.epochId), u64(fields.amount)),
  });
}

export function buildAcceptIntentInstruction(fields) {
  const authority = pubkey(fields.authority ?? fields.payer);
  const acceptedIntent = fields.acceptedIntent
    ? pubkey(fields.acceptedIntent)
    : deriveAcceptedIntentPda(fields);
  const data = concat(
    discriminator("tsn_accept_intent"), u64(fields.epochId),
    bytes32(fields.intentCommitment, "intentCommitment"), u64(fields.amount), u32(fields.tokenId),
    bytes32(fields.tipRootCommitment, "tipRootCommitment"), bytes32(fields.settlementCommitment, "settlementCommitment"),
    bytes32(fields.assetCommitment, "assetCommitment"), bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"), bytes32(fields.replayNonce, "replayNonce"),
    bytes32(fields.nullifier, "nullifier"), u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
  );
  return new TransactionInstruction({
    programId: TSN_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: pubkey(fields.motherEscrow), isSigner: false, isWritable: false },
      { pubkey: acceptedIntent, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Returns one atomic transaction: funding first, then intent acceptance. */
export function buildFundAndAcceptIntentTransaction(fields) {
  const fund = buildFundEpochTreasuryInstruction(fields);
  const accept = buildAcceptIntentInstruction(fields);
  return new Transaction().add(fund, accept);
}

export function deriveTcapPdas({ tipRootCommitment, authorizationDigest, nullifier }) {
  const root = bytes32(tipRootCommitment, "tipRootCommitment");
  const auth = bytes32(authorizationDigest, "authorizationDigest");
  const nf = bytes32(nullifier, "nullifier");
  const [config] = PublicKey.findProgramAddressSync([seed("tcap:global-config:v1")], TCAP_PROGRAM_ID);
  const [commitmentRoot] = PublicKey.findProgramAddressSync([seed("tcap:commitment-root:v1")], TCAP_PROGRAM_ID);
  const [tip] = PublicKey.findProgramAddressSync([seed("tcap:tin-tip:v1"), root], TCAP_PROGRAM_ID);
  const [receipt] = PublicKey.findProgramAddressSync([seed("tcap:tsn-auth-receipt:v1"), auth], TCAP_PROGRAM_ID);
  const [nullifierRecord] = PublicKey.findProgramAddressSync([seed("tcap:nullifier:v1"), nf], TCAP_PROGRAM_ID);
  const [tsnAuthorizationSigner] = PublicKey.findProgramAddressSync([seed("tsn:tcap-authorization:v1"), auth], TSN_PROGRAM_ID);
  return { config, commitmentRoot, tip, receipt, nullifierRecord, tsnAuthorizationSigner, tipRoot: new PublicKey(root) };
}

export function deriveOneTimeTipPda(blindedSettlementCommitment) {
  return PublicKey.findProgramAddressSync([
    seed("tcap:one-time-tip:v1"),
    bytes32(blindedSettlementCommitment, "blindedSettlementCommitment"),
  ], TCAP_PROGRAM_ID)[0];
}

export function buildInitializeOneTimeTipInstruction(fields) {
  const commitment = bytes32(fields.blindedSettlementCommitment, "blindedSettlementCommitment");
  const policy = bytes32(fields.policyCommitment, "policyCommitment");
  const tip = fields.oneTimeTip ? pubkey(fields.oneTimeTip) : deriveOneTimeTipPda(commitment);
  const data = concat(discriminator("initialize_one_time_tip"), commitment, policy, u32(fields.tokenId));
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: pubkey(fields.payer), isSigner: true, isWritable: true },
      { pubkey: tip, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildTsnRegisterOneTimeTipAuthorizationInstruction(fields) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const tip = pubkey(fields.oneTimeTip);
  const nextTip = fields.nextTip ? pubkey(fields.nextTip) : deriveOneTimeTipPda(fields.nextCommitment);
  const [signer] = PublicKey.findProgramAddressSync([seed("tsn:tcap-authorization:v1"), auth], TSN_PROGRAM_ID);
  const data = concat(
    discriminator("tsn_register_tcap_one_time_tip_authorization"), auth,
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
    bytes32(fields.nextCommitment, "nextCommitment"), bytes32(fields.nullifier, "nullifier"),
    u64(fields.sequence), u64(fields.amount), bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"),
  );
  return new TransactionInstruction({
    programId: TSN_PROGRAM_ID,
    keys: [
      { pubkey: pubkey(fields.authority ?? fields.payer), isSigner: true, isWritable: true },
      { pubkey: pubkey(fields.motherEscrow), isSigner: false, isWritable: false },
      { pubkey: TCAP_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.tcapConfig), isSigner: false, isWritable: false },
      { pubkey: tip, isSigner: false, isWritable: true },
      { pubkey: nextTip, isSigner: false, isWritable: true },
      { pubkey: signer, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildTsnRegisterOneTimeCreditInstruction(fields) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const [signer] = PublicKey.findProgramAddressSync([seed("tsn:tcap-authorization:v1"), auth], TSN_PROGRAM_ID);
  const data = concat(discriminator("tsn_register_tcap_one_time_credit"), auth, u64(fields.validAfterSlot), u64(fields.expiresAtSlot), bytes32(fields.nextCommitment, "nextCommitment"), bytes32(fields.nonce ?? fields.nullifier, "nonce"), u64(fields.sequence), u32(fields.tokenId), u64(fields.amount), bytes32(fields.policyCommitment, "policyCommitment"), bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"), bytes32(fields.previousCommitment ?? fields.currentCommitment, "previousCommitment"));
  return new TransactionInstruction({ programId: TSN_PROGRAM_ID, keys: [
    { pubkey: pubkey(fields.authority ?? fields.payer), isSigner: true, isWritable: true },
    { pubkey: pubkey(fields.motherEscrow), isSigner: false, isWritable: false },
    { pubkey: TCAP_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.tcapConfig), isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.currentTip), isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.reserveState), isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.liability), isSigner: false, isWritable: true },
    // The TSN wrapper signs this PDA during CPI; it is not an outer
    // transaction signer supplied by the caller.
    { pubkey: signer, isSigner: false, isWritable: false },
  ], data });
}

export function buildTsnRegisterOneTimeTransferCreditInstruction(fields) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const [signer] = PublicKey.findProgramAddressSync([seed("tsn:tcap-authorization:v1"), auth], TSN_PROGRAM_ID);
  const data = concat(discriminator("tsn_register_tcap_one_time_transfer_credit"), auth,
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot), bytes32(fields.nextCommitment, "nextCommitment"),
    bytes32(fields.nonce ?? fields.nullifier, "nonce"), u64(fields.sequence), u32(fields.tokenId), u64(fields.amount),
    bytes32(fields.policyCommitment, "policyCommitment"), bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"),
    bytes32(fields.previousCommitment, "previousCommitment"));
  // RegisterTcapOneTimeTransferCredit has no system_program account.  Do not
  // append one here: its Anchor order ends at tcap_authorization_signer.
  return new TransactionInstruction({ programId: TSN_PROGRAM_ID, keys: [
    { pubkey: pubkey(fields.authority ?? fields.payer), isSigner: true, isWritable: true },
    { pubkey: pubkey(fields.motherEscrow), isSigner: false, isWritable: false },
    { pubkey: TCAP_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.tcapConfig), isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.currentTip), isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.reserveState), isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.liability), isSigner: false, isWritable: true },
    { pubkey: signer, isSigner: false, isWritable: false },
  ], data });
}

/** TSN wrapper for the public-wallet exit. The destination is present only in
 * this exit transaction; no funding, source TIP, or receipt PDA is included. */
export function buildTsnRegisterTcapExitAuthorizationV1Instruction(fields) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const [signer] = PublicKey.findProgramAddressSync([seed("tsn:tcap-authorization:v1"), auth], TSN_PROGRAM_ID);
  const data = concat(discriminator("tsn_register_tcap_exit_authorization_v1"), auth,
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot), bytes32(fields.previousCommitment, "previousCommitment"),
    bytes32(fields.newCommitment, "newCommitment"), u64(fields.sequence), u32(fields.tokenId),
    bytes32(fields.policyCommitment, "policyCommitment"), bytes32(fields.nullifier, "nullifier"), u64(fields.exitAmount));
  return new TransactionInstruction({ programId: TSN_PROGRAM_ID, keys: [
    { pubkey: pubkey(fields.payer), isSigner: true, isWritable: true },
    { pubkey: pubkey(fields.motherEscrow), isSigner: false, isWritable: false },
    { pubkey: TCAP_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.tcapConfig), isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.currentTip), isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.reserveState), isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.liability), isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.reserveAuthority), isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.vault), isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.destination), isSigner: false, isWritable: true },
    { pubkey: pubkey(fields.destinationOwner), isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.mint), isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.tokenProgram ?? "TokenkegQfeZyiNwAJbbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
    { pubkey: signer, isSigner: false, isWritable: false },
  ], data });
}

export function deriveTcapExitAuthorizationDigest(fields) {
  return digest(concat(seed("TSN_TCAP_EXIT_V1"), pubkey(fields.tip).toBuffer(), pubkey(fields.destinationOwner).toBuffer(), u64(fields.validAfterSlot), u64(fields.expiresAtSlot), bytes32(fields.previousCommitment, "previousCommitment"), bytes32(fields.newCommitment, "newCommitment"), u64(fields.sequence), u32(fields.tokenId), bytes32(fields.policyCommitment, "policyCommitment"), bytes32(fields.nullifier, "nullifier"), u64(fields.exitAmount)));
}

export function buildDepositAssetV2Instruction(fields) {
  const mint = pubkey(fields.mint);
  const tokenProgram = pubkey(fields.tokenProgram ?? "TokenkegQfeZyiNwAJbbNbGKPFXCWuBvf9Ss623VQ5DA");
  const data = concat(discriminator("deposit_asset_v2"), u64(fields.amount));
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: pubkey(fields.depositor), isSigner: true, isWritable: true },
      { pubkey: pubkey(fields.config), isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.assetState), isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.reserveState), isSigner: false, isWritable: true },
      { pubkey: pubkey(fields.source), isSigner: false, isWritable: true },
      { pubkey: pubkey(fields.vault), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function deriveOneTimeTipLiabilityPda({ oneTimeTip, assetEntry }) {
  return PublicKey.findProgramAddressSync([
    seed("tcap:tip-liability:v2"), pubkey(oneTimeTip).toBuffer(), pubkey(assetEntry).toBuffer(),
  ], TCAP_PROGRAM_ID)[0];
}

export function buildInitializeOneTimeTipLiabilityInstruction(fields) {
  const tip = pubkey(fields.oneTimeTip);
  const liability = fields.liability ? pubkey(fields.liability) : deriveOneTimeTipLiabilityPda({ oneTimeTip: tip, assetEntry: fields.assetEntry });
  return new TransactionInstruction({ programId: TCAP_PROGRAM_ID, keys: [
    { pubkey: pubkey(fields.authority), isSigner: true, isWritable: true },
    { pubkey: pubkey(fields.tcapConfig), isSigner: false, isWritable: false },
    { pubkey: tip, isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.reserveState), isSigner: false, isWritable: true },
    { pubkey: liability, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data: concat(discriminator("initialize_one_time_tip_liability"), u64(fields.initialAvailable ?? 0)) });
}

export function buildConsumeOneTimeTipInstruction(fields) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const tip = pubkey(fields.oneTimeTip);
  const nextTip = fields.nextTip ? pubkey(fields.nextTip) : deriveOneTimeTipPda(fields.nextCommitment);
  const [signer] = PublicKey.findProgramAddressSync([seed("tsn:tcap-authorization:v1"), auth], TSN_PROGRAM_ID);
  const data = concat(
    discriminator("consume_one_time_tip"), auth,
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot),
    bytes32(fields.nextCommitment, "nextCommitment"), bytes32(fields.nullifier, "nullifier"),
    u64(fields.sequence), u64(fields.amount), bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"),
  );
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: pubkey(fields.payer), isSigner: true, isWritable: true },
      { pubkey: pubkey(fields.tcapConfig), isSigner: false, isWritable: false },
      { pubkey: tip, isSigner: false, isWritable: true },
      { pubkey: nextTip, isSigner: false, isWritable: true },
      { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: signer, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function deriveEncryptedSnapshotPda({ oneTimeTip, commitment }) {
  return PublicKey.findProgramAddressSync([
    seed("tcap:encrypted-snapshot"), pubkey(oneTimeTip).toBuffer(),
    bytes32(commitment, "commitment"),
  ], TCAP_PROGRAM_ID)[0];
}

export function buildStoreEncryptedSnapshotInstruction(fields) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const tip = pubkey(fields.oneTimeTip);
  const snapshot = fields.snapshot ? pubkey(fields.snapshot) : deriveEncryptedSnapshotPda({ oneTimeTip: tip, commitment: fields.commitment });
  const [signer] = PublicKey.findProgramAddressSync([seed("tsn:tcap-authorization:v1"), auth], TSN_PROGRAM_ID);
  const ciphertext = Buffer.isBuffer(fields.ciphertext) ? fields.ciphertext : Buffer.from(fields.ciphertext, "base64");
  const data = concat(
    discriminator("store_encrypted_snapshot"), auth,
    bytes32(fields.commitment, "commitment"), bytes32(fields.ownerBinding, "ownerBinding"),
    u64(fields.sequence), Buffer.from(fields.nonce), bytes32(fields.ciphertextCommitment, "ciphertextCommitment"),
    u32(ciphertext.length), ciphertext,
  );
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: pubkey(fields.payer), isSigner: true, isWritable: true },
      { pubkey: pubkey(fields.tcapConfig), isSigner: false, isWritable: false },
      { pubkey: tip, isSigner: false, isWritable: true },
      { pubkey: snapshot, isSigner: false, isWritable: true },
      { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: signer, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildTsnStoreEncryptedSnapshotInstruction(fields) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const tip = pubkey(fields.oneTimeTip);
  const snapshot = fields.snapshot ? pubkey(fields.snapshot) : deriveEncryptedSnapshotPda({ oneTimeTip: tip, commitment: fields.commitment });
  const [signer] = PublicKey.findProgramAddressSync([seed("tsn:tcap-authorization:v1"), auth], TSN_PROGRAM_ID);
  const ciphertext = Buffer.isBuffer(fields.ciphertext) ? fields.ciphertext : Buffer.from(fields.ciphertext, "base64");
  const data = concat(discriminator("tsn_store_tcap_encrypted_snapshot"), auth, bytes32(fields.commitment, "commitment"), bytes32(fields.ownerBinding, "ownerBinding"), u64(fields.sequence), Buffer.from(fields.nonce), bytes32(fields.ciphertextCommitment, "ciphertextCommitment"), u32(ciphertext.length), ciphertext);
  return new TransactionInstruction({ programId: TSN_PROGRAM_ID, keys: [
    { pubkey: pubkey(fields.authority ?? fields.payer), isSigner: true, isWritable: true }, { pubkey: pubkey(fields.motherEscrow), isSigner: false, isWritable: false },
    { pubkey: TCAP_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: pubkey(fields.tcapConfig), isSigner: false, isWritable: false }, { pubkey: tip, isSigner: false, isWritable: true },
    { pubkey: snapshot, isSigner: false, isWritable: true }, { pubkey: signer, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data });
}

export function deriveTsnEpochCommitmentPda({ motherEscrow, epochId }) {
  return PublicKey.findProgramAddressSync([
    seed("tsn:epoch-commitment:v1"),
    pubkey(motherEscrow).toBuffer(),
    u64(epochId),
  ], TSN_PROGRAM_ID)[0];
}

function authorizationBytes(fields) {
  return concat(
    u16(1),
    pubkey(fields.tsnProgramId ?? TSN_PROGRAM_ID).toBuffer(),
    u64(fields.epochId),
    bytes32(fields.intentCommitment, "intentCommitment"),
    u64(fields.amount),
    bytes32(fields.settlementCommitment, "settlementCommitment"),
    bytes32(fields.acceptedIntentRoot, "acceptedIntentRoot"),
    bytes32(fields.previousTcapRoot, "previousTcapRoot"),
    Buffer.from([1]), // TcapTransitionTypeV1::ConfidentialSettlement
    bytes32(fields.assetCommitment, "assetCommitment"),
    bytes32(fields.authorizationDigest, "authorizationDigest"),
    u16(fields.verifierDomainVersion ?? 1),
    u64(fields.validAfterSlot),
    u64(fields.expiresAtSlot),
    bytes32(fields.replayNonce, "replayNonce"),
    pubkey(fields.tip).toBuffer(),
    bytes32(fields.previousCommitment, "previousCommitment"),
    bytes32(fields.newCommitment, "newCommitment"),
    u64(fields.sequence),
    u32(fields.tokenId),
    bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"),
    bytes32(fields.nullifier, "nullifier"),
  );
}

/** Direct TCap instruction. The signer PDA can only be supplied by the TSN CPI wrapper. */
export function buildRegisterTsnAuthorizationInstruction(fields) {
  // Legacy V1 compatibility only. New transfers must use the V2 builder below;
  // V1 publishes intent/epoch/receipt bindings that are intentionally excluded
  // from the link-breaking GPRU/TCAP path.
  const pdas = deriveTcapPdas(fields);
  const data = concat(discriminator("register_tsn_authorization_v1"), authorizationBytes(fields));
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: pubkey(fields.payer), isSigner: true, isWritable: true },
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.reserveState), isSigner: false, isWritable: false },
      { pubkey: pdas.commitmentRoot, isSigner: false, isWritable: false },
      { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.tsnEpochCommitment), isSigner: false, isWritable: false },
      { pubkey: pdas.tsnAuthorizationSigner, isSigner: true, isWritable: false },
      { pubkey: pubkey(fields.acceptedIntent), isSigner: false, isWritable: false },
      { pubkey: pdas.receipt, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** TSN-owned CPI wrapper instruction; this is the executable Devnet path. */
export function buildTsnRegisterTcapCreditAuthorizationInstruction(fields) {
  // Legacy V1 compatibility only. Do not use for new transfers.
  const pdas = deriveTcapPdas(fields);
  const tsnEpochCommitment = deriveTsnEpochCommitmentPda({
    motherEscrow: fields.motherEscrow,
    epochId: fields.epochId,
  });
  const data = concat(
    discriminator("tsn_register_tcap_credit_authorization"),
    authorizationBytes(fields),
  );
  return new TransactionInstruction({
    programId: TSN_PROGRAM_ID,
    keys: [
      { pubkey: pubkey(fields.payer), isSigner: true, isWritable: true },
      { pubkey: pubkey(fields.motherEscrow), isSigner: false, isWritable: false },
      { pubkey: TCAP_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TSN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.reserveState), isSigner: false, isWritable: false },
      { pubkey: pdas.commitmentRoot, isSigner: false, isWritable: false },
      { pubkey: tsnEpochCommitment, isSigner: false, isWritable: true },
      { pubkey: pdas.receipt, isSigner: false, isWritable: true },
      { pubkey: pubkey(fields.acceptedIntent), isSigner: false, isWritable: false },
      { pubkey: pdas.tsnAuthorizationSigner, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildCreditTcapTinTipInstruction(fields) {
  const pdas = deriveTcapPdas(fields);
  const data = concat(
    discriminator("credit_tcap_tin_tip_v1"),
    bytes32(fields.previousCommitment, "previousCommitment"),
    bytes32(fields.newCommitment, "newCommitment"),
    u64(fields.sequence),
    u32(fields.tokenId),
    bytes32(fields.policyCommitment, "policyCommitment"),
    bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"),
    bytes32(fields.nullifier, "nullifier"),
  );
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: pubkey(fields.payer), isSigner: true, isWritable: true },
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pdas.tip, isSigner: false, isWritable: true },
      { pubkey: pdas.tipRoot, isSigner: false, isWritable: false },
      { pubkey: pubkey(fields.assetEntry), isSigner: false, isWritable: false },
      { pubkey: pdas.receipt, isSigner: false, isWritable: true },
      { pubkey: pdas.nullifierRecord, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function resolveExistingRepoRpc() {
  const configuredAnchorRpc = () => {
    for (const file of ["tcap-protocol/Anchor.toml", "tsn-protocol/tsn/protocol/Anchor.toml"]) {
      try {
        const match = fs.readFileSync(file, "utf8").match(/^cluster\s*=\s*"([^"]+)"/m);
        if (match?.[1] && /^https?:\/\//i.test(match[1])) return match[1];
      } catch { /* try the next repository configuration */ }
    }
    return undefined;
  };
  const rpc = process.env.TCAP_RPC_URL ?? process.env.ANCHOR_PROVIDER_URL ?? process.env.SOLANA_RPC_URL ?? configuredAnchorRpc();
  if (!rpc) throw new Error("Set TCAP_RPC_URL or ANCHOR_PROVIDER_URL from the repository's existing cluster configuration");
  return rpc;
}

export function loadExistingRepoWallet() {
  const walletPath = (process.env.SOLANA_WALLET ?? `${os.homedir()}/.config/solana/id.json`).replace(/^~(?=\\|\/)/, os.homedir());
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
}

export {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
};
