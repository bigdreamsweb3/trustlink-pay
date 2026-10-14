import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2";
import { utf8ToBytes } from "@noble/hashes/utils";
import { Buffer } from "buffer";

export const TCAP_PROGRAM_ID = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
const TSN_CREDIT_PROGRAM_ID = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
const hash = (value: Uint8Array) => Buffer.from(sha256(value));
const discriminator = (name: string) => hash(utf8ToBytes(name)).subarray(0, 8);
const bytes32 = (value: string, name: string) => {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error(`${name} must be 32-byte hex`);
  return Buffer.from(value, "hex");
};
const u32 = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new Error("TCAP_TOKEN_ID_OUT_OF_RANGE");
  const result = Buffer.alloc(4); result.writeUInt32LE(value); return result;
};
const u64 = (value: string) => {
  const n = BigInt(value);
  if (n < 0n || n > 0xffff_ffff_ffff_ffffn) throw new Error("TCAP_U64_OUT_OF_RANGE");
  const result = Buffer.alloc(8); result.writeBigUInt64LE(n); return result;
};
const bytes48 = (value: string) => {
  if (!/^[0-9a-f]{96}$/i.test(value)) throw new Error("TCAP_SEALED_VALUE_MUST_BE_48_BYTE_HEX");
  return Buffer.from(value, "hex");
};

/** Builds TCAP's sender-authorized reserve deposit. Account addresses must come
 * from the governed on-chain asset registry, not caller-invented PDAs. */
export function buildTcapDepositAssetV2Instruction(fields: {
  programId?: PublicKey;
  depositor: PublicKey;
  config: PublicKey;
  assetEntry: PublicKey;
  reserveState: PublicKey;
  source: PublicKey;
  vault: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
  amount: string | bigint;
}) {
  const amount = BigInt(fields.amount);
  if (amount <= 0n) throw new Error("TCAP_DEPOSIT_AMOUNT_MUST_BE_POSITIVE");
  const data = Buffer.concat([discriminator("global:deposit_asset_v2"), u64(amount.toString())]);
  return new TransactionInstruction({
    programId: fields.programId ?? TCAP_PROGRAM_ID,
    keys: [
      { pubkey: fields.depositor, isSigner: true, isWritable: true },
      { pubkey: fields.config, isSigner: false, isWritable: false },
      { pubkey: fields.assetEntry, isSigner: false, isWritable: false },
      { pubkey: fields.reserveState, isSigner: false, isWritable: true },
      { pubkey: fields.source, isSigner: false, isWritable: true },
      { pubkey: fields.vault, isSigner: false, isWritable: true },
      { pubkey: fields.mint, isSigner: false, isWritable: false },
      { pubkey: fields.tokenProgram, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Builds the wallet transaction for first funding of a TIN's TCAP TIP.
 * The Node/Cranker flow still validates and submits the fully wallet-signed
 * transaction; this helper does not send or sign it. */
export function buildTcapTinWalletDepositTransaction(fields: {
  depositor: PublicKey;
  blindedSettlementCommitment: string;
  policyCommitment: string;
  tokenId: number;
  config: PublicKey;
  assetEntry: PublicKey;
  reserveState: PublicKey;
  source: PublicKey;
  vault: PublicKey;
  mint: PublicKey;
  tokenProgram: PublicKey;
  amount: string | bigint;
  initializeTip: boolean;
}) {
  const transaction = new Transaction();
  if (fields.initializeTip) {
    transaction.add(buildInitializeOneTimeTipInstruction({
      payer: fields.depositor,
      blindedSettlementCommitment: fields.blindedSettlementCommitment,
      policyCommitment: fields.policyCommitment,
      tokenId: fields.tokenId,
    }));
  }
  transaction.add(buildTcapDepositAssetV2Instruction(fields));
  return transaction;
}

export function deriveOneTimeTipPda(blindedSettlementCommitment: string) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tcap:one-time-tip:v1"), bytes32(blindedSettlementCommitment, "blindedSettlementCommitment")],
    TCAP_PROGRAM_ID,
  )[0];
}

export function deriveOneTimeTipLiabilityPda(oneTimeTip: PublicKey, assetEntry: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tcap:tip-liability:v2"), oneTimeTip.toBuffer(), assetEntry.toBuffer()],
    TCAP_PROGRAM_ID,
  )[0];
}

/** Creates only the empty liability slot; the subsequent credit still requires TSN authorization. */
export function buildInitializeOneTimeTipLiabilityInstruction(fields: {
  payer: PublicKey; tcapConfig: PublicKey; oneTimeTip: PublicKey; assetEntry: PublicKey;
  reserveState: PublicKey; liability?: PublicKey;
}) {
  const data = Buffer.concat([
    discriminator("global:initialize_one_time_tip_liability"),
    u64("0"),
  ]);
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: fields.payer, isSigner: true, isWritable: true },
      { pubkey: fields.tcapConfig, isSigner: false, isWritable: false },
      { pubkey: fields.oneTimeTip, isSigner: false, isWritable: false },
      { pubkey: fields.assetEntry, isSigner: false, isWritable: false },
      { pubkey: fields.reserveState, isSigner: false, isWritable: true },
      { pubkey: fields.liability ?? deriveOneTimeTipLiabilityPda(fields.oneTimeTip, fields.assetEntry), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function deriveOneTimeCreditPermitDigest(fields: {
  currentTip: PublicKey; amount: string; tokenId: number; mint: PublicKey;
  nonce: string; sequence: string; previousCommitment: string;
}) {
  return hash(Buffer.concat([
    Buffer.from("TCAP_ONE_TIME_CREDIT_PERMIT_V1"), fields.currentTip.toBuffer(), u64(fields.amount),
    u32(fields.tokenId), fields.mint.toBuffer(), bytes32(fields.nonce, "nonce"),
    u64(fields.sequence), bytes32(fields.previousCommitment, "previousCommitment"),
  ])).toString("hex");
}

export type TsnOneTimeCreditInstructionParams = {
  authority: PublicKey; motherEscrow: PublicKey; tcapConfig: PublicKey;
  currentTip: PublicKey; assetEntry: PublicKey; reserveState: PublicKey; liability: PublicKey;
  authorizationDigest: string; validAfterSlot: string; expiresAtSlot: string;
  newCommitment: string; nonce: string; sequence: string; tokenId: number; amount: string;
  policyCommitment: string; gpruScopeCommitment: string; previousCommitment: string;
  sealed: string; sealCommitment: string;
};

/** Builds the exact TSN CPI wrapper for TCAP credit_one_time_tip. */
export function buildTsnRegisterOneTimeCreditInstruction(fields: TsnOneTimeCreditInstructionParams) {
  const auth = bytes32(fields.authorizationDigest, "authorizationDigest");
  const [tcapAuthorizationSigner] = PublicKey.findProgramAddressSync(
    [Buffer.from("tsn:tcap-authorization:v1"), auth], TSN_CREDIT_PROGRAM_ID,
  );
  const data = Buffer.concat([
    discriminator("global:tsn_register_tcap_one_time_credit"), auth,
    u64(fields.validAfterSlot), u64(fields.expiresAtSlot), bytes32(fields.newCommitment, "newCommitment"),
    bytes32(fields.nonce, "nonce"), u64(fields.sequence), u32(fields.tokenId), u64(fields.amount),
    bytes32(fields.policyCommitment, "policyCommitment"), bytes32(fields.gpruScopeCommitment, "gpruScopeCommitment"),
    bytes32(fields.previousCommitment, "previousCommitment"), bytes48(fields.sealed),
    bytes32(fields.sealCommitment, "sealCommitment"),
  ]);
  return new TransactionInstruction({
    programId: TSN_CREDIT_PROGRAM_ID,
    keys: [
      { pubkey: fields.authority, isSigner: true, isWritable: true },
      { pubkey: fields.motherEscrow, isSigner: false, isWritable: false },
      { pubkey: TCAP_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TSN_CREDIT_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: fields.tcapConfig, isSigner: false, isWritable: false },
      { pubkey: fields.currentTip, isSigner: false, isWritable: true },
      { pubkey: fields.assetEntry, isSigner: false, isWritable: false },
      { pubkey: fields.reserveState, isSigner: false, isWritable: true },
      { pubkey: fields.liability, isSigner: false, isWritable: true },
      { pubkey: tcapAuthorizationSigner, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildInitializeOneTimeTipInstruction(fields: {
  payer: PublicKey; blindedSettlementCommitment: string; policyCommitment: string; tokenId: number;
}) {
  const root = bytes32(fields.blindedSettlementCommitment, "blindedSettlementCommitment");
  const data = Buffer.concat([
    discriminator("global:initialize_one_time_tip"), root,
    bytes32(fields.policyCommitment, "policyCommitment"), u32(fields.tokenId),
  ]);
  return new TransactionInstruction({
    programId: TCAP_PROGRAM_ID,
    keys: [
      { pubkey: fields.payer, isSigner: true, isWritable: true },
      { pubkey: deriveOneTimeTipPda(fields.blindedSettlementCommitment), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
