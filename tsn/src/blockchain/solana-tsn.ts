import { createHash } from "crypto";
import { utils as anchorUtils } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import { env } from "../lib/env";
import { logger } from "../lib/logger";
import {
  estimateTransactionFeeLamports,
  getConnection,
  getEscrowAuthorityKeypair,
  getEscrowConfigState,
  instructionDiscriminator,
  TOKEN_PROGRAM_ID,
} from "./solana-core";
import { VERIFIED_TSN_PROGRAM_ID } from "../program";

const VERIFIED_TSN_PROGRAM_PUBLIC_KEY = new PublicKey(VERIFIED_TSN_PROGRAM_ID);

function getVerifiedTsnProgramId() {
  return VERIFIED_TSN_PROGRAM_PUBLIC_KEY;
}

const TSN_MOTHER_ESCROW_SEED = Buffer.from("tsn_mother_escrow");
const TSN_INTENT_SEED = Buffer.from("tsn_intent");
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

export function getTsnIntentPda(params: { motherEscrow: PublicKey; intentSeed32: Buffer }): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TSN_INTENT_SEED, params.motherEscrow.toBuffer(), params.intentSeed32],
    getVerifiedTsnProgramId(),
  )[0];
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

export async function tsnCreateIntentOnChain(params: {
  payer?: Keypair;
  intentSeed32: Buffer;
  underlyingPayment: PublicKey;
  tokenMint: PublicKey;
  amountBaseUnits: bigint;
  recipientHash32: Buffer;
}) {
  if (env.SOLANA_MOCK_MODE || !env.TSN_CREATE_INTENTS_ONCHAIN) {
    return { mode: "mock" as const, signature: null as string | null };
  }

  const connection = getConnection();
  const payer: Keypair = params.payer ?? getEscrowAuthorityKeypair();
  const motherEscrow = getTsnMotherEscrowPda();
  const intent = getTsnIntentPda({ motherEscrow, intentSeed32: params.intentSeed32 });

  const ix = new TransactionInstruction({
    programId: getVerifiedTsnProgramId(),
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: intent, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      instructionDiscriminator("tsn_create_intent"),
      params.intentSeed32, // [u8;32]
      params.underlyingPayment.toBuffer(),
      params.tokenMint.toBuffer(),
      encodeU64(params.amountBaseUnits),
      params.recipientHash32, // [u8;32]
    ]),
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });

  logger.info("tsn.intent.onchain_created", {
    intent: intent.toBase58(),
    signature,
  });

  return { mode: "devnet" as const, signature };
}

export async function tsnInitializeMotherEscrowOnChain(params: {
  authority?: Keypair;
  protocolSeed32: Buffer;
  epochSeconds: bigint;
  leaseSeconds: bigint;
  feeSplitCrankerBps?: number | null;
  feeSplitLpBps?: number | null;
  feeSplitTreasuryBps?: number | null;
}) {
  if (env.SOLANA_MOCK_MODE) {
    return { mode: "mock" as const, signature: null as string | null };
  }

  const connection = getConnection();
  const authority = params.authority ?? getEscrowAuthorityKeypair();
  const motherEscrow = getTsnMotherEscrowPda();
  const existing = await tsnFetchMotherEscrowOnChain();
  if (existing?.valid) {
    logger.info("tsn.mother_escrow.already_initialized", { motherEscrow: existing.address });
    return { mode: "devnet" as const, signature: null as string | null, motherEscrow: existing.address };
  }
  if (existing && !existing.valid) {
    throw new Error(
      `TSN mother escrow ${motherEscrow.toBase58()} already exists but is not readable as the current MotherEscrow layout (${existing.reason}). Deploy a fresh TSN program id or add a migration/close instruction for this PDA before running init-mother again.`,
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
  protocolSeed32: Buffer;
  epochSeconds: bigint;
  leaseSeconds: bigint;
  feeSplitCrankerBps?: number | null;
  feeSplitLpBps?: number | null;
  feeSplitTreasuryBps?: number | null;
}) {
  if (env.SOLANA_MOCK_MODE) {
    return { mode: "mock" as const, signature: null as string | null };
  }

  const connection = getConnection();
  const authority = params.authority ?? getEscrowAuthorityKeypair();
  const motherEscrow = getTsnMotherEscrowPda();

  const ix = new TransactionInstruction({
    programId: getVerifiedTsnProgramId(),
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      instructionDiscriminator("tsn_migrate_mother_escrow"),
      params.protocolSeed32,
      encodeI64(params.epochSeconds),
      encodeI64(params.leaseSeconds),
      encodeOptionU16(params.feeSplitCrankerBps),
      encodeOptionU16(params.feeSplitLpBps),
      encodeOptionU16(params.feeSplitTreasuryBps),
    ]),
  });

  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [authority], {
    commitment: "confirmed",
  });
  logger.info("tsn.mother_escrow.migrated", { motherEscrow: motherEscrow.toBase58(), signature });
  return { mode: "devnet" as const, signature, motherEscrow: motherEscrow.toBase58() };
}

export async function tsnRegisterCrankerOnChain(params: { operator: Keypair }) {
  if (env.SOLANA_MOCK_MODE) {
    return { mode: "mock" as const, signature: null as string | null };
  }

  const connection = getConnection();
  const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator.publicKey });

  const existing = await connection.getAccountInfo(cranker, "confirmed");
  if (existing) {
    logger.info("tsn.cranker.already_registered", {
      motherEscrow: motherEscrow.toBase58(),
      operator: params.operator.publicKey.toBase58(),
      cranker: cranker.toBase58(),
    });
    return { mode: "devnet" as const, signature: null as string | null, cranker: cranker.toBase58() };
  }

  const ix = new TransactionInstruction({
    programId: getVerifiedTsnProgramId(),
    keys: [
      { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: cranker, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([instructionDiscriminator("tsn_register_cranker")]),
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [params.operator], { commitment: "confirmed" });
  logger.info("tsn.cranker.registered", { cranker: cranker.toBase58(), signature });
  return { mode: "devnet" as const, signature };
}

export async function tsnSetCrankerFundingPolicyOnChain(params: {
  operator: Keypair;
  allowExternalFunding: boolean;
}) {
  if (env.SOLANA_MOCK_MODE) {
    return { mode: "mock" as const, signature: null as string | null };
  }

  const connection = getConnection();
  const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator.publicKey });

  const ix = new TransactionInstruction({
    programId: getVerifiedTsnProgramId(),
    keys: [
      { pubkey: params.operator.publicKey, isSigner: true, isWritable: false },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: cranker, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([
      instructionDiscriminator("tsn_set_cranker_funding_policy"),
      Buffer.from([params.allowExternalFunding ? 1 : 0]),
    ]),
  });

  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [params.operator], {
    commitment: "confirmed",
  });
  return { mode: "devnet" as const, signature };
}

export async function tsnInitializeCrankerVaultOnChain(params: {
  payer: Keypair;
  operator: PublicKey;
  tokenMint: PublicKey;
}) {
  if (env.SOLANA_MOCK_MODE) {
    return { mode: "mock" as const, signature: null as string | null };
  }

  const connection = getConnection();
  const payer = params.payer;
  const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator });
  const crankerVault = getTsnCrankerVaultPda({ cranker, tokenMint: params.tokenMint });
  const vaultAuthority = getTsnCrankerVaultAuthorityPda({ crankerVault });
  const vaultTokenAccount = getTsnCrankerVaultTokenPda({ crankerVault });

  const ix = new TransactionInstruction({
    programId: getVerifiedTsnProgramId(),
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: cranker, isSigner: false, isWritable: false },
      { pubkey: params.tokenMint, isSigner: false, isWritable: false },
      { pubkey: crankerVault, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([instructionDiscriminator("tsn_initialize_cranker_vault")]),
  });

  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], {
    commitment: "confirmed",
  });
  return {
    mode: "devnet" as const,
    signature,
    crankerVault: crankerVault.toBase58(),
    vaultTokenAccount: vaultTokenAccount.toBase58(),
  };
}

export async function tsnFundCrankerOnChain(params: {
  funder: Keypair;
  operator: PublicKey;
  tokenMint: PublicKey;
  funderTokenAccount: PublicKey;
  amountBaseUnits: bigint;
}) {
  if (env.SOLANA_MOCK_MODE) {
    return { mode: "mock" as const, signature: null as string | null };
  }

  const connection = getConnection();
  const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator });
  const crankerVault = getTsnCrankerVaultPda({ cranker, tokenMint: params.tokenMint });
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
      { pubkey: params.funderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: liquidityPosition, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([instructionDiscriminator("tsn_fund_cranker"), encodeU64(params.amountBaseUnits)]),
  });

  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [params.funder], {
    commitment: "confirmed",
  });
  return { mode: "devnet" as const, signature, liquidityPosition: liquidityPosition.toBase58() };
}

export async function tsnWithdrawCrankerFundsOnChain(params: {
  funder: Keypair;
  operator: PublicKey;
  tokenMint: PublicKey;
  funderTokenAccount: PublicKey;
  amountBaseUnits: bigint;
}) {
  if (env.SOLANA_MOCK_MODE) {
    return { mode: "mock" as const, signature: null as string | null };
  }

  const connection = getConnection();
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

  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [params.funder], {
    commitment: "confirmed",
  });
  return { mode: "devnet" as const, signature };
}

export async function tsnSettleEpochOnChain(params: { authority?: Keypair; force?: boolean }) {
  if (env.SOLANA_MOCK_MODE) {
    return { mode: "mock" as const, signature: null as string | null };
  }

  const connection = getConnection();
  const authority = params.authority ?? getEscrowAuthorityKeypair();
  const motherEscrow = getTsnMotherEscrowPda();

  const ix = new TransactionInstruction({
    programId: getVerifiedTsnProgramId(),
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: motherEscrow, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([
      instructionDiscriminator("tsn_settle_epoch"),
      Buffer.from([params.force ? 1 : 0]),
    ]),
  });

  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [authority], {
    commitment: "confirmed",
  });
  return { mode: "devnet" as const, signature };
}

export async function tsnClaimIntentOnChain(params: { operator: Keypair; intent: PublicKey }) {
  if (env.SOLANA_MOCK_MODE) {
    return { mode: "mock" as const, signature: "mock-claim" };
  }

  const connection = getConnection();
  const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator.publicKey });

  const ix = new TransactionInstruction({
    programId: getVerifiedTsnProgramId(),
    keys: [
      { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: params.intent, isSigner: false, isWritable: true },
      { pubkey: cranker, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([instructionDiscriminator("tsn_claim_intent")]),
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [params.operator], { commitment: "confirmed" });
  logger.info("tsn.intent.claimed", { intent: params.intent.toBase58(), cranker: cranker.toBase58(), signature });
  return { mode: "devnet" as const, signature };
}

export async function estimateTsnClaimNetworkFeeLamports(params: {
  intent: PublicKey;
  tokenMint: PublicKey;
  recipientWallet: PublicKey;
}) {
  if (!env.TSN_ENABLED || env.SOLANA_MOCK_MODE) {
    return 0;
  }

  const connection = getConnection();
  const operator = getEscrowAuthorityKeypair();
  const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({ motherEscrow, operator: operator.publicKey });
  const crankerVault = getTsnCrankerVaultPda({ cranker, tokenMint: params.tokenMint });
  const vaultAuthority = getTsnCrankerVaultAuthorityPda({ crankerVault });
  const vaultTokenAccount = getTsnCrankerVaultTokenPda({ crankerVault });
  const recipientTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, params.recipientWallet);
  const operatorTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, operator.publicKey);
  const escrowConfig = await getEscrowConfigState();
  const treasuryOwnerRaw = env.TRUSTLINK_TREASURY_OWNER ?? escrowConfig?.treasuryOwner ?? null;
  if (!treasuryOwnerRaw) {
    throw new Error("TRUSTLINK_TREASURY_OWNER is not configured (required for TSN fee routing).");
  }
  const treasuryOwner = new PublicKey(treasuryOwnerRaw);
  const treasuryTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, treasuryOwner);
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");

  const claimTx = new Transaction({
    feePayer: operator.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }).add(
    new TransactionInstruction({
      programId: getVerifiedTsnProgramId(),
      keys: [
        { pubkey: operator.publicKey, isSigner: true, isWritable: true },
        { pubkey: motherEscrow, isSigner: false, isWritable: false },
        { pubkey: params.intent, isSigner: false, isWritable: true },
        { pubkey: cranker, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([instructionDiscriminator("tsn_claim_intent")]),
    }),
  );

  const proofTx = new Transaction({
    feePayer: operator.publicKey,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
  const recipientTokenAccountInfo = await connection.getAccountInfo(recipientTokenAccount, "confirmed");
  const operatorTokenAccountInfo = await connection.getAccountInfo(operatorTokenAccount, "confirmed");
  const treasuryTokenAccountInfo = await connection.getAccountInfo(treasuryTokenAccount, "confirmed");
  if (!recipientTokenAccountInfo) {
    proofTx.add(
      createAssociatedTokenAccountInstruction(
        operator.publicKey,
        recipientTokenAccount,
        params.recipientWallet,
        params.tokenMint,
        SPL_TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }
  proofTx.add(
    new TransactionInstruction({
      programId: getVerifiedTsnProgramId(),
      keys: [
        { pubkey: operator.publicKey, isSigner: true, isWritable: true },
        { pubkey: motherEscrow, isSigner: false, isWritable: false },
        { pubkey: params.intent, isSigner: false, isWritable: true },
        { pubkey: cranker, isSigner: false, isWritable: true },
        { pubkey: crankerVault, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority, isSigner: false, isWritable: false },
        { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
        { pubkey: operatorTokenAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
        { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([instructionDiscriminator("tsn_submit_proof"), Buffer.alloc(64), encodeU64(0n)]),
    }),
  );

  const [claimFeeLamports, proofFeeLamports] = await Promise.all([
    estimateTransactionFeeLamports(connection, claimTx),
    estimateTransactionFeeLamports(connection, proofTx),
  ]);
  const rentLamports = await connection.getMinimumBalanceForRentExemption(165, "confirmed");
  const recipientAtaRentLamports = recipientTokenAccountInfo ? 0 : rentLamports;
  const operatorAtaRentLamports = operatorTokenAccountInfo ? 0 : rentLamports;
  const treasuryAtaRentLamports = treasuryTokenAccountInfo ? 0 : rentLamports;

  return claimFeeLamports + proofFeeLamports + recipientAtaRentLamports + operatorAtaRentLamports + treasuryAtaRentLamports;
}

export async function tsnSubmitProofOnChain(params: {
  operator: Keypair;
  intent: PublicKey;
  payoutTxSig64: Buffer;
  payoutAmountBaseUnits: bigint;
  tokenMint: PublicKey;
  recipientWallet: PublicKey;
}) {
  if (params.payoutTxSig64.length !== 64) {
    throw new Error("payoutTxSig64 must be 64 bytes");
  }

  if (env.SOLANA_MOCK_MODE) {
    return { mode: "mock" as const, signature: "mock-proof" };
  }

  const connection = getConnection();
  const motherEscrow = getTsnMotherEscrowPda();
  const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator.publicKey });
  const crankerVault = getTsnCrankerVaultPda({ cranker, tokenMint: params.tokenMint });
  const vaultAuthority = getTsnCrankerVaultAuthorityPda({ crankerVault });
  const vaultTokenAccount = getTsnCrankerVaultTokenPda({ crankerVault });
  const recipientTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, params.recipientWallet);
  const operatorTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, params.operator.publicKey);
  const escrowConfig = await getEscrowConfigState();
  const treasuryOwnerRaw = env.TRUSTLINK_TREASURY_OWNER ?? escrowConfig?.treasuryOwner ?? null;
  if (!treasuryOwnerRaw) {
    throw new Error("TRUSTLINK_TREASURY_OWNER is not configured (required for TSN fee routing).");
  }
  const treasuryOwner = new PublicKey(treasuryOwnerRaw);
  const treasuryTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, treasuryOwner);

  const ix = new TransactionInstruction({
    programId: getVerifiedTsnProgramId(),
    keys: [
      { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
      { pubkey: motherEscrow, isSigner: false, isWritable: false },
      { pubkey: params.intent, isSigner: false, isWritable: true },
      { pubkey: cranker, isSigner: false, isWritable: true },
      { pubkey: crankerVault, isSigner: false, isWritable: true },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
      { pubkey: operatorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      instructionDiscriminator("tsn_submit_proof"),
      params.payoutTxSig64,
      encodeU64(params.payoutAmountBaseUnits),
    ]),
  });

  const tx = new Transaction();
  const recipientTokenAccountInfo = await connection.getAccountInfo(recipientTokenAccount, "confirmed");
  const operatorTokenAccountInfo = await connection.getAccountInfo(operatorTokenAccount, "confirmed");
  const treasuryTokenAccountInfo = await connection.getAccountInfo(treasuryTokenAccount, "confirmed");
  if (!recipientTokenAccountInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        params.operator.publicKey,
        recipientTokenAccount,
        params.recipientWallet,
        params.tokenMint,
        SPL_TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }
  if (!operatorTokenAccountInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        params.operator.publicKey,
        operatorTokenAccount,
        params.operator.publicKey,
        params.tokenMint,
        SPL_TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }
  if (!treasuryTokenAccountInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        params.operator.publicKey,
        treasuryTokenAccount,
        treasuryOwner,
        params.tokenMint,
        SPL_TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }
  tx.add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [params.operator], { commitment: "confirmed" });
  logger.info("tsn.proof.submitted", { intent: params.intent.toBase58(), cranker: cranker.toBase58(), signature });
  return { mode: "devnet" as const, signature };
}

export async function tsnFetchIntentOnChain(params: { intent: PublicKey }) {
  if (env.SOLANA_MOCK_MODE) {
    return null;
  }

  const connection = getConnection();
  const info = await connection.getAccountInfo(params.intent, "confirmed");
  if (!info?.data) return null;

  const data = Buffer.from(info.data);
  if (data.length < 8 + 32 + 32 + 32 + 32 + 8 + 32 + 1) {
    return null;
  }

  let offset = 8; // anchor discriminator
  const motherEscrow = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const intentId = data.subarray(offset, offset + 32);
  offset += 32;
  const underlyingPayment = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const tokenMint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const amount = data.readBigUInt64LE(offset);
  offset += 8;
  const recipientHash32 = data.subarray(offset, offset + 32);
  offset += 32;
  const status = data.readUInt8(offset);
  offset += 1;
  const assignedCranker = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const leaseExpiryTs = data.readBigInt64LE(offset);
  offset += 8;
  const proofSubmitted = data.readUInt8(offset) === 1;
  offset += 1;
  const payoutTxSig64 = data.subarray(offset, offset + 64);
  offset += 64;
  const createdAtTs = data.readBigInt64LE(offset);
  offset += 8;
  const executedAtTs = data.readBigInt64LE(offset);
  offset += 8;
  const settledEpochId = data.readBigUInt64LE(offset);
  offset += 8;
  const bump = data.readUInt8(offset);

  const payoutTxSigBase58 = proofSubmitted ? anchorUtils.bytes.bs58.encode(payoutTxSig64) : null;

  return {
    motherEscrow,
    intentId,
    underlyingPayment,
    tokenMint,
    amount,
    recipientHash32,
    status,
    assignedCranker,
    leaseExpiryTs,
    proofSubmitted,
    payoutTxSigBase58,
    createdAtTs,
    executedAtTs,
    settledEpochId,
    bump,
  };
}

export async function tsnFetchMotherEscrowOnChain() {
  if (env.SOLANA_MOCK_MODE) {
    return null;
  }

  const connection = getConnection();
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
  if (data.length < 8 + 32 + 32 + 8 + 8 + 2 + 2 + 2 + 8 + 8 + 1) {
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
  const epochId = data.readBigUInt64LE(offset);
  offset += 8;
  const lastEpochSettledTs = data.readBigInt64LE(offset);
  offset += 8;
  const bump = data.readUInt8(offset);

  return {
    ...base,
    valid: true as const,
    authority: authority.toBase58(),
    protocolSeed,
    epochSeconds,
    leaseSeconds,
    feeSplitCrankerBps,
    feeSplitLpBps,
    feeSplitTreasuryBps,
    epochId,
    lastEpochSettledTs,
    bump,
  };
}
