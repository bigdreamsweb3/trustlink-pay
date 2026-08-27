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
  const rpc = process.env.TCAP_RPC_URL ?? process.env.ANCHOR_PROVIDER_URL ?? process.env.SOLANA_RPC_URL;
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
