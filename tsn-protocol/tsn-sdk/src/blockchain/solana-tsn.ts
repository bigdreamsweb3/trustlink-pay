import { createHash } from "crypto";
import { utils as anchorUtils } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import { logger } from "../lib/logger.js";
import {
  getEscrowAuthorityKeypair,
  getConnection,
  instructionDiscriminator,
  TOKEN_PROGRAM_ID,
} from "./solana-core.js";
import { VERIFIED_TSN_PROGRAM_ID } from "../program.js";

const VERIFIED_TSN_PROGRAM_PUBLIC_KEY = new PublicKey(VERIFIED_TSN_PROGRAM_ID);

function getVerifiedTsnProgramId() {
  return VERIFIED_TSN_PROGRAM_PUBLIC_KEY;
}

function isAlreadyProcessedTransactionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const transactionMessage =
    error && typeof error === "object" && "transactionMessage" in error
      ? String((error as { transactionMessage?: unknown }).transactionMessage ?? "")
      : "";
  return (
    message.includes("This transaction has already been processed") ||
    transactionMessage.includes("This transaction has already been processed")
  );
}

function getSignedTransactionSignature(tx: Transaction) {
  const signature = tx.signature ?? tx.signatures.find((entry) => entry.signature)?.signature;
  if (!signature) {
    throw new Error("Sender-signed settlement transaction is missing a signature after cranker signing.");
  }
  return anchorUtils.bytes.bs58.encode(signature);
}

async function confirmSubmittedTransaction(connection: ReturnType<typeof getConnection>, signature: string) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const status = (await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    })).value[0];
    if (status?.err) {
      const transaction = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      const logs = transaction?.meta?.logMessages?.join(" | ") ?? "";
      const error = new Error(
        `TSN settlement transaction failed: ${JSON.stringify(status.err)}${logs ? `; logs=${logs}` : ""}`,
      ) as Error & { transactionLogs?: string[] };
      error.transactionLogs = transaction?.meta?.logMessages ?? undefined;
      throw error;
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`TSN settlement confirmation timed out; signature=${signature}`);
}

const TSN_MOTHER_ESCROW_SEED = Buffer.from("tsn_mother_escrow");
const TSN_VERIFIER_SEED = Buffer.from("verifier");
const TSN_CRANKER_SEED = Buffer.from("tsn_cranker");
const TSN_CRANKER_VAULT_SEED = Buffer.from("tsn_cranker_vault");
const TSN_CRANKER_VAULT_AUTHORITY_SEED = Buffer.from("tsn_cranker_vault_authority");
const TSN_LIQUIDITY_POSITION_SEED = Buffer.from("tsn_liquidity_position");

export function sha256Bytes(input: string): Buffer {
  return createHash("sha256").update(input).digest();
}

export function getTsnMotherEscrowPda(): PublicKey {
  return PublicKey.findProgramAddressSync([TSN_MOTHER_ESCROW_SEED], getVerifiedTsnProgramId())[0];
}


export function getTsnVerifierPda(): PublicKey {
  return PublicKey.findProgramAddressSync([TSN_VERIFIER_SEED], getVerifiedTsnProgramId())[0];
}

export function getTsnCrankerPda(params: { motherEscrow: PublicKey; operator: PublicKey }): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TSN_CRANKER_SEED, params.motherEscrow.toBuffer(), params.operator.toBuffer()],
    getVerifiedTsnProgramId(),
  )[0];
}

export function getTsnCrankerVaultPda(params: { cranker: PublicKey; tokenMint: PublicKey }): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TSN_CRANKER_VAULT_SEED, params.cranker.toBuffer(), params.tokenMint.toBuffer()],
    getVerifiedTsnProgramId(),
  )[0];
}

export function getTsnCrankerVaultAuthorityPda(params: { crankerVault: PublicKey }): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TSN_CRANKER_VAULT_AUTHORITY_SEED, params.crankerVault.toBuffer()],
    getVerifiedTsnProgramId(),
  )[0];
}

export function getTsnCrankerVaultTokenPda(params: { crankerVault: PublicKey }): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tsn_cranker_vault_token"), params.crankerVault.toBuffer()],
    getVerifiedTsnProgramId(),
  )[0];
}

export function getTsnLiquidityPositionPda(params: { crankerVault: PublicKey; funder: PublicKey }): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TSN_LIQUIDITY_POSITION_SEED, params.crankerVault.toBuffer(), params.funder.toBuffer()],
    getVerifiedTsnProgramId(),
  )[0];
}

function encodeU64(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

function encodeI64(value: bigint) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(value);
  return buffer;
}

function encodeOptionU16(value?: number | null) {
  if (value == null) return Buffer.from([0]);
  const buffer = Buffer.alloc(1 + 2);
  buffer.writeUInt8(1, 0);
  buffer.writeUInt16LE(value, 1);
  return buffer;
}




export async function tsnSubmitEpochFundingTransaction(params: {
  operator: Keypair;
  signedTransactionBase64: string;
  rpcUrl?: string;
}) {
  const connection = getConnection(params.rpcUrl);
  const tx = Transaction.from(Buffer.from(params.signedTransactionBase64, "base64"));
  if (!tx.feePayer?.equals(params.operator.publicKey)) {
    throw new Error(
      `Sender-signed epoch funding fee payer mismatch. Expected cranker ${params.operator.publicKey.toBase58()}, got ${tx.feePayer?.toBase58() ?? "missing"}.`,
    );
  }

  tx.partialSign(params.operator);
  const signedTransaction = tx.serialize({
    requireAllSignatures: true,
    verifySignatures: true,
  });
  const signedTransactionSignature = getSignedTransactionSignature(tx);
  let signature: string;
  try {
    signature = await connection.sendRawTransaction(signedTransaction, {
      preflightCommitment: "confirmed",
    });
  } catch (error) {
    if (!isAlreadyProcessedTransactionError(error)) {
      throw error;
    }
    signature = signedTransactionSignature;
    logger.info("tsn.epoch_funding.replay_confirmed", {
      feePayer: params.operator.publicKey.toBase58(),
      signature,
    });
  }
  await confirmSubmittedTransaction(connection, signature);

  logger.info("tsn.epoch_funding.submitted", {
    feePayer: params.operator.publicKey.toBase58(),
    signature,
    stage: "EPOCH_TREASURY_FUNDING",
  });

  return { mode: "devnet" as const, signature };
}

export async function tsnInitializeMotherEscrowOnChain(params: {
  authority?: Keypair;
  tinsProgramId: PublicKey;
  protocolSeed32: Buffer;
  epochSeconds: bigint;
  leaseSeconds: bigint;
  feeSplitCrankerBps?: number | null;
  feeSplitLpBps?: number | null;
  feeSplitTreasuryBps?: number | null;
  rpcUrl?: string;
  secretKey?: string | null;
}) {
  if (!params.authority && (params.secretKey === null || params.secretKey === undefined)) {
    return { mode: "mock" as const, signature: null as string | null };
  }

  const connection = getConnection(params.rpcUrl);
  const authority = params.authority ?? getEscrowAuthorityKeypair(params.secretKey);
  const motherEscrow = getTsnMotherEscrowPda();
  const existing = await tsnFetchMotherEscrowOnChain(params.rpcUrl);
  if (existing && existing.valid) {
    if (existing.tinsProgramId !== params.tinsProgramId.toBase58()) {
      throw new Error(
        `TSN mother escrow is initialized with TIP program ${existing.tinsProgramId}, not ${params.tinsProgramId.toBase58()}.`,
      );
    }
    logger.info("tsn.mother_escrow.already_initialized", { motherEscrow: existing.address });
    return { mode: "devnet" as const, signature: null as string | null, motherEscrow: existing.address };
  }
  if (existing && !existing.valid) {
    const reason = "reason" in existing ? existing.reason : "unknown";
    throw new Error(
      `TSN mother escrow ${motherEscrow.toBase58()} already exists but is not readable as the current MotherEscrow layout (${reason}). Deploy a fresh TSN program id or add a migration/close instruction for this PDA before running init-mother again.`,
    );
  }

  const ix = new TransactionInstruction({
    programId: getVerifiedTsnProgramId(),
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      instructionDiscriminator("tsn_initialize_mother_escrow"),
      params.tinsProgramId.toBytes(),
      params.protocolSeed32,
      encodeI64(params.epochSeconds),
      encodeI64(params.leaseSeconds),
      encodeOptionU16(params.feeSplitCrankerBps),
      encodeOptionU16(params.feeSplitLpBps),
      encodeOptionU16(params.feeSplitTreasuryBps),
    ]),
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [authority], { commitment: "confirmed" });
  logger.info("tsn.mother_escrow.initialized", { motherEscrow: motherEscrow.toBase58(), signature });
  return { mode: "devnet" as const, signature };
}

export async function tsnMigrateMotherEscrowOnChain(params: {
  authority?: Keypair;
  tinsProgramId: PublicKey;
  protocolSeed32: Buffer;
  epochSeconds: bigint;
  leaseSeconds: bigint;
  feeSplitCrankerBps?: number | null;
  feeSplitLpBps?: number | null;
  feeSplitTreasuryBps?: number | null;
  rpcUrl?: string;
  secretKey?: string | null;
}) {
  if (!params.authority && (params.secretKey === null || params.secretKey === undefined)) {
    return { mode: "mock" as const, signature: null as string | null };
  }

  const connection = getConnection(params.rpcUrl);
  const authority = params.authority ?? getEscrowAuthorityKeypair(params.secretKey);
  const motherEscrow = getTsnMotherEscrowPda();
  const existing = await tsnFetchMotherEscrowOnChain(params.rpcUrl);
  if (existing && existing.valid) {
    throw new Error(
      `TSN mother escrow ${motherEscrow.toBase58()} is already valid. Only invalid accounts can be migrated.`,
    );
  }

  const ix = new TransactionInstruction({
    programId: getVerifiedTsnProgramId(),
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      instructionDiscriminator("tsn_migrate_mother_escrow"),
      params.tinsProgramId.toBytes(),
      params.protocolSeed32,
      encodeI64(params.epochSeconds),
      encodeI64(params.leaseSeconds),
      encodeOptionU16(params.feeSplitCrankerBps),
      encodeOptionU16(params.feeSplitLpBps),
      encodeOptionU16(params.feeSplitTreasuryBps),
    ]),
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [authority], { commitment: "confirmed" });
  logger.info("tsn.mother_escrow.migrated", { motherEscrow: motherEscrow.toBase58(), signature });
  return { mode: "devnet" as const, signature };
}



export async function tsnRegisterCrankerOnChain(params: { operator?: Keypair; rpcUrl?: string; secretKey?: string | null }) {
  if (!params.operator && (params.secretKey === null || params.secretKey === undefined)) return { mode: "mock" as const, signature: null as string | null };
  const connection = getConnection(params.rpcUrl); const operator = params.operator ?? getEscrowAuthorityKeypair(params.secretKey); const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({ motherEscrow, operator: operator.publicKey }); if (await connection.getAccountInfo(cranker, "confirmed")) return { mode: "devnet" as const, signature: null as string | null };
  const ix = new TransactionInstruction({ programId: getVerifiedTsnProgramId(), keys: [{ pubkey: operator.publicKey, isSigner: true, isWritable: true }, { pubkey: motherEscrow, isSigner: false, isWritable: false }, { pubkey: cranker, isSigner: false, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }], data: instructionDiscriminator("tsn_register_cranker") });
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [operator], { commitment: "confirmed" }); return { mode: "devnet" as const, signature };
}

export async function tsnSetCrankerFundingPolicyOnChain(params: { operator: Keypair; allowExternalFunding: boolean; rpcUrl?: string }) {
  const connection = getConnection(params.rpcUrl); const motherEscrow = getTsnMotherEscrowPda(); const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator.publicKey });
  const ix = new TransactionInstruction({ programId: getVerifiedTsnProgramId(), keys: [{ pubkey: params.operator.publicKey, isSigner: true, isWritable: true }, { pubkey: motherEscrow, isSigner: false, isWritable: false }, { pubkey: cranker, isSigner: false, isWritable: true }], data: Buffer.concat([instructionDiscriminator("tsn_set_cranker_funding_policy"), Buffer.from([params.allowExternalFunding ? 1 : 0])]) });
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [params.operator], { commitment: "confirmed" }); return { mode: "devnet" as const, signature };
}

export async function tsnInitializeCrankerVaultOnChain(params: { payer?: Keypair; operator: PublicKey; tokenMint: PublicKey; rpcUrl?: string; secretKey?: string | null }) {
  if (!params.payer && (params.secretKey === null || params.secretKey === undefined)) return { mode: "mock" as const, signature: null as string | null };
  const connection = getConnection(params.rpcUrl); const payer = params.payer ?? getEscrowAuthorityKeypair(params.secretKey); const motherEscrow = getTsnMotherEscrowPda(); const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator }); const crankerVault = getTsnCrankerVaultPda({ cranker, tokenMint: params.tokenMint }); const vaultAuthority = getTsnCrankerVaultAuthorityPda({ crankerVault }); const vaultTokenAccount = getTsnCrankerVaultTokenPda({ crankerVault });
  const ix = new TransactionInstruction({ programId: getVerifiedTsnProgramId(), keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }, { pubkey: motherEscrow, isSigner: false, isWritable: false }, { pubkey: cranker, isSigner: false, isWritable: true }, { pubkey: params.tokenMint, isSigner: false, isWritable: false }, { pubkey: crankerVault, isSigner: false, isWritable: true }, { pubkey: vaultAuthority, isSigner: false, isWritable: false }, { pubkey: vaultTokenAccount, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }], data: instructionDiscriminator("tsn_initialize_cranker_vault") });
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], { commitment: "confirmed" }); return { mode: "devnet" as const, signature };
}

export async function tsnFundCrankerOnChain(params: { funder: Keypair; operator: PublicKey; tokenMint: PublicKey; funderTokenAccount: PublicKey; amountBaseUnits: bigint; rpcUrl?: string }) {
  const connection = getConnection(params.rpcUrl); const motherEscrow = getTsnMotherEscrowPda(); const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator }); const crankerVault = getTsnCrankerVaultPda({ cranker, tokenMint: params.tokenMint }); const vaultTokenAccount = getTsnCrankerVaultTokenPda({ crankerVault }); const liquidityPosition = getTsnLiquidityPositionPda({ crankerVault, funder: params.funder.publicKey });
  const ix = new TransactionInstruction({ programId: getVerifiedTsnProgramId(), keys: [{ pubkey: params.funder.publicKey, isSigner: true, isWritable: true }, { pubkey: motherEscrow, isSigner: false, isWritable: false }, { pubkey: cranker, isSigner: false, isWritable: false }, { pubkey: crankerVault, isSigner: false, isWritable: true }, { pubkey: params.funderTokenAccount, isSigner: false, isWritable: true }, { pubkey: vaultTokenAccount, isSigner: false, isWritable: true }, { pubkey: liquidityPosition, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }], data: Buffer.concat([instructionDiscriminator("tsn_fund_cranker"), encodeU64(params.amountBaseUnits)]) });
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [params.funder], { commitment: "confirmed" }); return { mode: "devnet" as const, signature };
}

export async function tsnWithdrawCrankerFundsOnChain(params: {
  funder: Keypair;
  operator: PublicKey;
  tokenMint: PublicKey;
  funderTokenAccount: PublicKey;
  amountBaseUnits: bigint;
  rpcUrl?: string;
}) {
  const connection = getConnection(params.rpcUrl);
  const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator });
  const crankerVault = getTsnCrankerVaultPda({ cranker, tokenMint: params.tokenMint });
  const vaultAuthority = getTsnCrankerVaultAuthorityPda({ crankerVault });
  const vaultTokenAccount = getTsnCrankerVaultTokenPda({ crankerVault });
  const liquidityPosition = getTsnLiquidityPositionPda({
    crankerVault,
    funder: params.funder.publicKey,
  });

  const ix = new TransactionInstruction({
    programId: getVerifiedTsnProgramId(),
    keys: [
      { pubkey: params.funder.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: cranker, isSigner: false, isWritable: false },
      { pubkey: crankerVault, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.funderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: liquidityPosition, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([instructionDiscriminator("tsn_withdraw_cranker_funds"), encodeU64(params.amountBaseUnits)]),
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [params.funder], { commitment: "confirmed" });
  logger.info("tsn.cranker.withdrawn", { amountBaseUnits: params.amountBaseUnits.toString(), signature });
  return { mode: "devnet" as const, signature };
}







export async function tsnFetchMotherEscrowOnChain(rpcUrl?: string) {
  const connection = getConnection(rpcUrl);
  const motherEscrow = getTsnMotherEscrowPda();
  const info = await connection.getAccountInfo(motherEscrow, "confirmed");
  if (!info?.data) {
    return null;
  }

  const data = Buffer.from(info.data);
  const base = {
    address: motherEscrow.toBase58(),
    owner: info.owner.toBase58(),
    lamports: info.lamports,
    executable: info.executable,
    dataLength: data.length,
    discriminatorHex: data.subarray(0, Math.min(8, data.length)).toString("hex"),
  };
  if (data.length < 8 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 8 + 8 + 1) {
    return { ...base, valid: false as const, reason: "account-too-small" as const };
  }

  const expectedDiscriminator = createHash("sha256")
    .update("account:MotherEscrow")
    .digest()
    .subarray(0, 8);
  const actualDiscriminator = data.subarray(0, 8);
  if (!actualDiscriminator.equals(expectedDiscriminator)) {
    return {
      ...base,
      valid: false as const,
      reason: "wrong-discriminator" as const,
      expectedDiscriminatorHex: expectedDiscriminator.toString("hex"),
    };
  }

  let offset = 8;
  const authority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const tinsProgramId = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const protocolSeed = data.subarray(offset, offset + 32);
  offset += 32;
  const epochSeconds = data.readBigInt64LE(offset);
  offset += 8;
  const leaseSeconds = data.readBigInt64LE(offset);
  offset += 8;
  const feeSplitCrankerBps = data.readUInt16LE(offset);
  offset += 2;
  const feeSplitLpBps = data.readUInt16LE(offset);
  offset += 2;
  const feeSplitTreasuryBps = data.readUInt16LE(offset);
  offset += 2;
  const tinFeeSplitVerifyCrankerBps = data.readUInt16LE(offset);
  offset += 2;
  const tinFeeSplitSubmitCrankerBps = data.readUInt16LE(offset);
  offset += 2;
  const tinFeeSplitTeamBps = data.readUInt16LE(offset);
  offset += 2;
  const tinFeeSplitReservePoolBps = data.readUInt16LE(offset);
  offset += 2;
  const epochId = data.readBigUInt64LE(offset);
  offset += 8;
  const lastEpochSettledTs = data.readBigInt64LE(offset);
  offset += 8;
  const bump = data.readUInt8(offset);

  return {
    ...base,
    valid: true as const,
    authority: authority.toBase58(),
    tinsProgramId: tinsProgramId.toBase58(),
    protocolSeed,
    epochSeconds,
    leaseSeconds,
    feeSplitCrankerBps,
    feeSplitLpBps,
    feeSplitTreasuryBps,
    tinFeeSplitVerifyCrankerBps,
    tinFeeSplitSubmitCrankerBps,
    tinFeeSplitTeamBps,
    tinFeeSplitReservePoolBps,
    epochId,
    lastEpochSettledTs,
    bump,
  };
}
