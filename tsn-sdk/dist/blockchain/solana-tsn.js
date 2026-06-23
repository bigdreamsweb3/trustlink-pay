import { createHash } from "crypto";
import { utils as anchorUtils } from "@coral-xyz/anchor";
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, } from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction, } from "@solana/web3.js";
import { logger } from "../lib/logger.js";
import { getEscrowAuthorityKeypair, getConnection, getEscrowConfigState, instructionDiscriminator, TOKEN_PROGRAM_ID, } from "./solana-core.js";
import { VERIFIED_TSN_PROGRAM_ID } from "../program.js";
const VERIFIED_TSN_PROGRAM_PUBLIC_KEY = new PublicKey(VERIFIED_TSN_PROGRAM_ID);
function getVerifiedTsnProgramId() {
    return VERIFIED_TSN_PROGRAM_PUBLIC_KEY;
}
const TSN_MOTHER_ESCROW_SEED = Buffer.from("tsn_mother_escrow");
const TSN_INTENT_SEED = Buffer.from("tsn_intent");
const TSN_VERIFIER_SEED = Buffer.from("verifier");
const TSN_TREASURY_SEED = Buffer.from("tsn_treasury");
const TSN_CRANKER_SEED = Buffer.from("tsn_cranker");
const TSN_CRANKER_VAULT_SEED = Buffer.from("tsn_cranker_vault");
const TSN_CRANKER_VAULT_AUTHORITY_SEED = Buffer.from("tsn_cranker_vault_authority");
const TSN_LIQUIDITY_POSITION_SEED = Buffer.from("tsn_liquidity_position");
const TSN_PAYMENT_VAULT_SEED = Buffer.from("vault");
const TSN_EPOCH_ACCOUNT_SEED = Buffer.from("tsn_epoch");
const TSN_PEA_SEED = Buffer.from("pea");
export function sha256Bytes(input) {
    return createHash("sha256").update(input).digest();
}
export function getTsnMotherEscrowPda() {
    return PublicKey.findProgramAddressSync([TSN_MOTHER_ESCROW_SEED], getVerifiedTsnProgramId())[0];
}
export function getTsnIntentPda(params) {
    return PublicKey.findProgramAddressSync([TSN_INTENT_SEED, params.motherEscrow.toBuffer(), params.intentSeed32], getVerifiedTsnProgramId())[0];
}
export function getTsnVerifierPda() {
    return PublicKey.findProgramAddressSync([TSN_VERIFIER_SEED], getVerifiedTsnProgramId())[0];
}
export function getTsnTreasuryPda() {
    return PublicKey.findProgramAddressSync([TSN_TREASURY_SEED], getVerifiedTsnProgramId())[0];
}
export function getTsnCrankerPda(params) {
    return PublicKey.findProgramAddressSync([TSN_CRANKER_SEED, params.motherEscrow.toBuffer(), params.operator.toBuffer()], getVerifiedTsnProgramId())[0];
}
export function getTsnEpochAccountPda(params) {
    const epoch = encodeU64(BigInt(params.epochId));
    return PublicKey.findProgramAddressSync([TSN_EPOCH_ACCOUNT_SEED, params.motherEscrow.toBuffer(), epoch], getVerifiedTsnProgramId())[0];
}
export function getTsnPeaPda(params) {
    const epoch = encodeU64(BigInt(params.epochId));
    return PublicKey.findProgramAddressSync([TSN_PEA_SEED, epoch, params.tokenMint.toBuffer()], getVerifiedTsnProgramId())[0];
}
export function getTsnCrankerVaultPda(params) {
    return PublicKey.findProgramAddressSync([TSN_CRANKER_VAULT_SEED, params.cranker.toBuffer(), params.tokenMint.toBuffer()], getVerifiedTsnProgramId())[0];
}
export function getTsnCrankerVaultAuthorityPda(params) {
    return PublicKey.findProgramAddressSync([TSN_CRANKER_VAULT_AUTHORITY_SEED, params.crankerVault.toBuffer()], getVerifiedTsnProgramId())[0];
}
export function getTsnCrankerVaultTokenPda(params) {
    return PublicKey.findProgramAddressSync([Buffer.from("tsn_cranker_vault_token"), params.crankerVault.toBuffer()], getVerifiedTsnProgramId())[0];
}
export function getTsnLiquidityPositionPda(params) {
    return PublicKey.findProgramAddressSync([TSN_LIQUIDITY_POSITION_SEED, params.crankerVault.toBuffer(), params.funder.toBuffer()], getVerifiedTsnProgramId())[0];
}
function encodeU64(value) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(value);
    return buffer;
}
function encodeI64(value) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64LE(value);
    return buffer;
}
function encodeOptionU16(value) {
    if (value == null)
        return Buffer.from([0]);
    const buffer = Buffer.alloc(1 + 2);
    buffer.writeUInt8(1, 0);
    buffer.writeUInt16LE(value, 1);
    return buffer;
}
export async function estimateTsnClaimNetworkFeeLamports(params) {
    const motherEscrow = getTsnMotherEscrowPda();
    const intent = getTsnIntentPda({ motherEscrow, intentSeed32: Buffer.alloc(32) });
    const recipientTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, params.recipientWallet);
    const dummyTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, Keypair.generate().publicKey);
    const needsRecipientAta = false; // Simulate without creating actual ATA
    const ix = new TransactionInstruction({
        programId: getVerifiedTsnProgramId(),
        keys: [
            { pubkey: Keypair.generate().publicKey, isSigner: true, isWritable: true },
            { pubkey: motherEscrow, isSigner: false, isWritable: false },
            { pubkey: intent, isSigner: false, isWritable: false },
            { pubkey: PublicKey.findProgramAddressSync([Buffer.from("tsn_cranker")], getVerifiedTsnProgramId())[0], isSigner: false, isWritable: false },
            { pubkey: PublicKey.findProgramAddressSync([Buffer.from("tsn_cranker_vault")], getVerifiedTsnProgramId())[0], isSigner: false, isWritable: true },
            { pubkey: getTsnCrankerVaultAuthorityPda({ crankerVault: PublicKey.findProgramAddressSync([Buffer.from("tsn_cranker_vault")], getVerifiedTsnProgramId())[0] }), isSigner: false, isWritable: false },
            { pubkey: dummyTokenAccount, isSigner: false, isWritable: true },
            { pubkey: dummyTokenAccount, isSigner: false, isWritable: true },
            { pubkey: needsRecipientAta ? recipientTokenAccount : PublicKey.default, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([instructionDiscriminator("tsn_claim_intent"), Buffer.alloc(64)]),
    });
    return 5000; // Rough estimate for claim transaction fee
}
export async function tsnCreateIntentOnChain(params) {
    if (!params.payer && (params.secretKey === null || params.secretKey === undefined)) {
        return { mode: "mock", signature: null };
    }
    const connection = getConnection(params.rpcUrl);
    const payer = params.payer ?? getEscrowAuthorityKeypair(params.secretKey);
    const motherEscrow = getTsnMotherEscrowPda();
    const cranker = getTsnCrankerPda({ motherEscrow, operator: payer.publicKey });
    const verifierPda = getTsnVerifierPda();
    const intent = getTsnIntentPda({ motherEscrow, intentSeed32: params.intentSeed32 });
    const ix = new TransactionInstruction({
        programId: getVerifiedTsnProgramId(),
        keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            { pubkey: motherEscrow, isSigner: false, isWritable: false },
            { pubkey: cranker, isSigner: false, isWritable: true },
            { pubkey: verifierPda, isSigner: false, isWritable: true },
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
    const tx = new Transaction({ feePayer: payer.publicKey }).add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    logger.info("tsn.intent.onchain_created", {
        intent: intent.toBase58(),
        feePayer: payer.publicKey.toBase58(),
        verifierPda: verifierPda.toBase58(),
        signature,
    });
    return { mode: "devnet", signature };
}
export function getTsnPaymentVaultPda(paymentIntentId) {
    return PublicKey.findProgramAddressSync([TSN_PAYMENT_VAULT_SEED, encodeU64(paymentIntentId)], getVerifiedTsnProgramId())[0];
}
export async function tsnSubmitSenderSignedSettlementTransaction(params) {
    const connection = getConnection(params.rpcUrl);
    const tx = Transaction.from(Buffer.from(params.signedTransactionBase64, "base64"));
    if (!tx.feePayer?.equals(params.operator.publicKey)) {
        throw new Error(`Sender-signed settlement fee payer mismatch. Expected cranker ${params.operator.publicKey.toBase58()}, got ${tx.feePayer?.toBase58() ?? "missing"}.`);
    }
    tx.partialSign(params.operator);
    const signature = await connection.sendRawTransaction(tx.serialize({
        requireAllSignatures: true,
        verifySignatures: true,
    }), { preflightCommitment: "confirmed" });
    await connection.confirmTransaction(signature, "confirmed");
    logger.info("tsn.intent.sender_signed_settlement_submitted", {
        feePayer: params.operator.publicKey.toBase58(),
        signature,
    });
    return { mode: "devnet", signature };
}
export async function tsnInitializeMotherEscrowOnChain(params) {
    if (!params.authority && (params.secretKey === null || params.secretKey === undefined)) {
        return { mode: "mock", signature: null };
    }
    const connection = getConnection(params.rpcUrl);
    const authority = params.authority ?? getEscrowAuthorityKeypair(params.secretKey);
    const motherEscrow = getTsnMotherEscrowPda();
    const existing = await tsnFetchMotherEscrowOnChain(params.rpcUrl);
    if (existing?.valid) {
        if (existing.tinsProgramId !== params.tinsProgramId.toBase58()) {
            throw new Error(`TSN mother escrow is initialized with TINS program ${existing.tinsProgramId}, not ${params.tinsProgramId.toBase58()}.`);
        }
        logger.info("tsn.mother_escrow.already_initialized", { motherEscrow: existing.address });
        return { mode: "devnet", signature: null, motherEscrow: existing.address };
    }
    if (existing && !existing.valid) {
        throw new Error(`TSN mother escrow ${motherEscrow.toBase58()} already exists but is not readable as the current MotherEscrow layout (${existing.reason}). Deploy a fresh TSN program id or add a migration/close instruction for this PDA before running init-mother again.`);
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
    return { mode: "devnet", signature };
}
export async function tsnMigrateMotherEscrowOnChain(params) {
    if (!params.authority && (params.secretKey === null || params.secretKey === undefined)) {
        return { mode: "mock", signature: null };
    }
    const connection = getConnection(params.rpcUrl);
    const authority = params.authority ?? getEscrowAuthorityKeypair(params.secretKey);
    const motherEscrow = getTsnMotherEscrowPda();
    const existing = await tsnFetchMotherEscrowOnChain(params.rpcUrl);
    if (existing && existing.valid) {
        throw new Error(`TSN mother escrow ${motherEscrow.toBase58()} is already valid. Only invalid accounts can be migrated.`);
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
    return { mode: "devnet", signature };
}
export async function tsnSettleEpochOnChain(params) {
    if (!params.authority && (params.secretKey === null || params.secretKey === undefined)) {
        return { mode: "mock", signature: null };
    }
    const connection = getConnection(params.rpcUrl);
    const authority = params.authority ?? getEscrowAuthorityKeypair(params.secretKey);
    const motherEscrow = getTsnMotherEscrowPda();
    const ix = new TransactionInstruction({
        programId: getVerifiedTsnProgramId(),
        keys: [
            { pubkey: authority.publicKey, isSigner: true, isWritable: true },
            { pubkey: motherEscrow, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([instructionDiscriminator(params.force ? "tsn_force_settle_epoch" : "tsn_settle_epoch")]),
    });
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [authority], { commitment: "confirmed" });
    logger.info("tsn.epoch.settled", { signature, force: params.force });
    return { mode: "devnet", signature };
}
export async function tsnProcessBatchReimbursementOnChain(params) {
    if (!params.operator && (params.secretKey === null || params.secretKey === undefined)) {
        return { mode: "mock", signature: null };
    }
    const connection = getConnection(params.rpcUrl);
    const operator = params.operator ?? getEscrowAuthorityKeypair(params.secretKey);
    const motherEscrow = getTsnMotherEscrowPda();
    const cranker = getTsnCrankerPda({ motherEscrow, operator: operator.publicKey });
    const epochAccount = getTsnEpochAccountPda({ motherEscrow, epochId: params.epochId });
    const rootHash = typeof params.recomputedRootHash === "string"
        ? Buffer.from(params.recomputedRootHash, "hex")
        : Buffer.from(params.recomputedRootHash);
    if (rootHash.length !== 32)
        throw new Error("TSN epoch root hash must be 32 bytes");
    const ix = new TransactionInstruction({
        programId: getVerifiedTsnProgramId(),
        keys: [
            { pubkey: operator.publicKey, isSigner: true, isWritable: true },
            { pubkey: motherEscrow, isSigner: false, isWritable: false },
            { pubkey: epochAccount, isSigner: false, isWritable: true },
            { pubkey: cranker, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([
            instructionDiscriminator("tsn_process_batch_reimbursement"),
            rootHash,
            encodeU64(BigInt(params.totalToDistribute)),
            encodeU64(BigInt(params.crankerCreditSumMod)),
        ]),
    });
    const tx = new Transaction();
    if (params.computeUnitPriceMicroLamports != null && BigInt(params.computeUnitPriceMicroLamports) > 0n) {
        tx.add(ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: Number(params.computeUnitPriceMicroLamports),
        }));
    }
    tx.add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [operator], { commitment: "confirmed" });
    logger.info("tsn.epoch.reimbursement_processed", {
        epochId: String(params.epochId),
        epochAccount: epochAccount.toBase58(),
        cranker: cranker.toBase58(),
        signature,
    });
    return { mode: "devnet", signature, epochAccount: epochAccount.toBase58(), cranker: cranker.toBase58() };
}
export async function tsnRegisterCrankerOnChain(params) {
    if (!params.operator && (params.secretKey === null || params.secretKey === undefined)) {
        return { mode: "mock", signature: null };
    }
    const connection = getConnection(params.rpcUrl);
    const operator = params.operator ?? getEscrowAuthorityKeypair(params.secretKey);
    const motherEscrow = getTsnMotherEscrowPda();
    const cranker = getTsnCrankerPda({ motherEscrow, operator: operator.publicKey });
    const existingCranker = await connection.getAccountInfo(cranker, "confirmed");
    if (existingCranker) {
        logger.info("tsn.cranker.already_registered", { cranker: cranker.toBase58() });
        return { mode: "devnet", signature: null };
    }
    const ix = new TransactionInstruction({
        programId: getVerifiedTsnProgramId(),
        keys: [
            { pubkey: operator.publicKey, isSigner: true, isWritable: true },
            { pubkey: motherEscrow, isSigner: false, isWritable: false },
            { pubkey: cranker, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: instructionDiscriminator("tsn_register_cranker"),
    });
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [operator], { commitment: "confirmed" });
    logger.info("tsn.cranker.registered", { cranker: cranker.toBase58(), signature });
    return { mode: "devnet", signature };
}
export async function tsnSetCrankerFundingPolicyOnChain(params) {
    const connection = getConnection(params.rpcUrl);
    const motherEscrow = getTsnMotherEscrowPda();
    const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator.publicKey });
    const ix = new TransactionInstruction({
        programId: getVerifiedTsnProgramId(),
        keys: [
            { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
            { pubkey: motherEscrow, isSigner: false, isWritable: false },
            { pubkey: cranker, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([instructionDiscriminator("tsn_set_cranker_funding_policy"), Buffer.from([params.allowExternalFunding ? 1 : 0])]),
    });
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [params.operator], { commitment: "confirmed" });
    logger.info("tsn.cranker.funding_policy_set", { allowExternalFunding: params.allowExternalFunding, signature });
    return { mode: "devnet", signature };
}
export async function tsnInitializeCrankerVaultOnChain(params) {
    if (!params.payer && (params.secretKey === null || params.secretKey === undefined)) {
        return { mode: "mock", signature: null };
    }
    const connection = getConnection(params.rpcUrl);
    const payer = params.payer ?? getEscrowAuthorityKeypair(params.secretKey);
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
            { pubkey: cranker, isSigner: false, isWritable: true },
            { pubkey: params.tokenMint, isSigner: false, isWritable: false },
            { pubkey: crankerVault, isSigner: false, isWritable: true },
            { pubkey: vaultAuthority, isSigner: false, isWritable: false },
            { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: instructionDiscriminator("tsn_initialize_cranker_vault"),
    });
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    logger.info("tsn.cranker.vault_initialized", { crankerVault: crankerVault.toBase58(), signature });
    return { mode: "devnet", signature };
}
export async function tsnFundCrankerOnChain(params) {
    const connection = getConnection(params.rpcUrl);
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
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [params.funder], { commitment: "confirmed" });
    logger.info("tsn.cranker.funded", { amountBaseUnits: params.amountBaseUnits.toString(), signature });
    return { mode: "devnet", signature };
}
export async function tsnWithdrawCrankerFundsOnChain(params) {
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
    return { mode: "devnet", signature };
}
export async function tsnClaimIntentOnChain(params) {
    const connection = getConnection(params.rpcUrl);
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
        data: instructionDiscriminator("tsn_claim_intent"),
    });
    const tx = new Transaction({ feePayer: params.operator.publicKey }).add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [params.operator], { commitment: "confirmed" });
    logger.info("tsn.intent.claimed", {
        intent: params.intent.toBase58(),
        feePayer: params.operator.publicKey.toBase58(),
        signature,
    });
    return { mode: "devnet", signature };
}
export async function tsnReassignIntentOnChain(params) {
    const connection = getConnection(params.rpcUrl);
    const motherEscrow = getTsnMotherEscrowPda();
    const ix = new TransactionInstruction({
        programId: getVerifiedTsnProgramId(),
        keys: [
            { pubkey: params.authority.publicKey, isSigner: true, isWritable: true },
            { pubkey: motherEscrow, isSigner: false, isWritable: false },
            { pubkey: params.intent, isSigner: false, isWritable: true },
        ],
        data: instructionDiscriminator("tsn_reassign_intent"),
    });
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [params.authority], { commitment: "confirmed" });
    logger.info("tsn.intent.reassigned", { intent: params.intent.toBase58(), signature });
    return { mode: "devnet", signature };
}
export async function tsnSubmitProofOnChain(params) {
    if (params.payoutTxSig64.length !== 64) {
        throw new Error("payoutTxSig64 must be 64 bytes");
    }
    const connection = getConnection(params.rpcUrl);
    const motherEscrow = getTsnMotherEscrowPda();
    const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator.publicKey });
    const crankerVault = getTsnCrankerVaultPda({ cranker, tokenMint: params.tokenMint });
    const vaultAuthority = getTsnCrankerVaultAuthorityPda({ crankerVault });
    const vaultTokenAccount = getTsnCrankerVaultTokenPda({ crankerVault });
    const recipientTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, params.recipientWallet);
    const operatorTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, params.operator.publicKey);
    const escrowConfig = await getEscrowConfigState();
    const treasuryOwnerRaw = params.treasuryOwner ?? escrowConfig?.treasuryOwner ?? getTsnTreasuryPda().toBase58();
    const treasuryOwner = new PublicKey(treasuryOwnerRaw);
    const treasuryTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, treasuryOwner, true);
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
            Buffer.from(params.payoutTxSig64),
            encodeU64(params.payoutAmountBaseUnits),
        ]),
    });
    const tx = new Transaction({ feePayer: params.operator.publicKey });
    const recipientTokenAccountInfo = await connection.getAccountInfo(recipientTokenAccount, "confirmed");
    const operatorTokenAccountInfo = await connection.getAccountInfo(operatorTokenAccount, "confirmed");
    const treasuryTokenAccountInfo = await connection.getAccountInfo(treasuryTokenAccount, "confirmed");
    if (!recipientTokenAccountInfo) {
        tx.add(createAssociatedTokenAccountInstruction(params.operator.publicKey, recipientTokenAccount, params.recipientWallet, params.tokenMint, SPL_TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
    }
    if (!operatorTokenAccountInfo) {
        tx.add(createAssociatedTokenAccountInstruction(params.operator.publicKey, operatorTokenAccount, params.operator.publicKey, params.tokenMint, SPL_TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
    }
    if (!treasuryTokenAccountInfo) {
        tx.add(createAssociatedTokenAccountInstruction(params.operator.publicKey, treasuryTokenAccount, treasuryOwner, params.tokenMint, SPL_TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
    }
    tx.add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [params.operator], { commitment: "confirmed" });
    logger.info("tsn.proof.submitted", {
        intent: params.intent.toBase58(),
        cranker: cranker.toBase58(),
        feePayer: params.operator.publicKey.toBase58(),
        signature,
    });
    return { mode: "devnet", signature };
}
export async function tsnClaimVaultSettlementOnChain(params) {
    if (params.otdtHash32.length !== 32) {
        throw new Error("otdtHash32 must contain exactly 32 bytes");
    }
    const connection = getConnection(params.rpcUrl);
    const motherEscrow = getTsnMotherEscrowPda();
    const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator.publicKey });
    const paymentVault = getTsnPaymentVaultPda(params.paymentIntentId);
    const ix = new TransactionInstruction({
        programId: getVerifiedTsnProgramId(),
        keys: [
            { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
            { pubkey: motherEscrow, isSigner: false, isWritable: false },
            { pubkey: cranker, isSigner: false, isWritable: true },
            { pubkey: paymentVault, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([
            instructionDiscriminator("tsn_claim_vault_settlement"),
            encodeU64(params.paymentIntentId),
            Buffer.from(params.otdtHash32),
        ]),
    });
    const signature = await sendAndConfirmTransaction(connection, new Transaction({ feePayer: params.operator.publicKey }).add(ix), [params.operator], { commitment: "confirmed" });
    logger.info("tsn.vault.settlement_lease_claimed", {
        paymentVault: paymentVault.toBase58(),
        cranker: cranker.toBase58(),
        signature,
    });
    return { mode: "devnet", signature, paymentVault: paymentVault.toBase58() };
}
export async function tsnExecuteVaultPayoutOnChain(params) {
    if (params.otdt.length !== 32 || params.decryptionSecret.length !== 32) {
        throw new Error("OTDT and decryptionSecret must each contain exactly 32 bytes");
    }
    const connection = getConnection(params.rpcUrl);
    const motherEscrow = getTsnMotherEscrowPda();
    const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator.publicKey });
    const paymentVault = getTsnPaymentVaultPda(params.paymentIntentId);
    const crankerVault = getTsnCrankerVaultPda({ cranker, tokenMint: params.tokenMint });
    const vaultAuthority = getTsnCrankerVaultAuthorityPda({ crankerVault });
    const vaultTokenAccount = getTsnCrankerVaultTokenPda({ crankerVault });
    const recipientTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, params.recipientWallet);
    const ix = new TransactionInstruction({
        programId: getVerifiedTsnProgramId(),
        keys: [
            { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
            { pubkey: motherEscrow, isSigner: false, isWritable: false },
            { pubkey: cranker, isSigner: false, isWritable: true },
            { pubkey: paymentVault, isSigner: false, isWritable: true },
            { pubkey: crankerVault, isSigner: false, isWritable: true },
            { pubkey: vaultAuthority, isSigner: false, isWritable: false },
            { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
            { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([
            instructionDiscriminator("tsn_execute_vault_payout"),
            encodeU64(params.paymentIntentId),
            encodeU64(params.payoutAmountBaseUnits),
            encodeU64(params.claimFeeAmountBaseUnits ?? 0n),
            Buffer.from(params.otdt),
            Buffer.from(params.decryptionSecret),
        ]),
    });
    const tx = new Transaction({ feePayer: params.operator.publicKey });
    const recipientTokenAccountInfo = await connection.getAccountInfo(recipientTokenAccount, "confirmed");
    if (!recipientTokenAccountInfo) {
        tx.add(createAssociatedTokenAccountInstruction(params.operator.publicKey, recipientTokenAccount, params.recipientWallet, params.tokenMint, SPL_TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
    }
    tx.add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [params.operator], { commitment: "confirmed" });
    logger.info("tsn.vault_payout.executed", {
        cranker: cranker.toBase58(),
        vault: crankerVault.toBase58(),
        paymentVault: paymentVault.toBase58(),
        recipient: params.recipientWallet.toBase58(),
        feePayer: params.operator.publicKey.toBase58(),
        signature,
    });
    return { mode: "devnet", signature };
}
export async function tsnClaimVaultRecoveryOnChain(params) {
    const connection = getConnection(params.rpcUrl);
    const motherEscrow = getTsnMotherEscrowPda();
    const cranker = getTsnCrankerPda({ motherEscrow, operator: params.operator.publicKey });
    const paymentVault = getTsnPaymentVaultPda(params.paymentIntentId);
    const ix = new TransactionInstruction({
        programId: getVerifiedTsnProgramId(),
        keys: [
            { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
            { pubkey: motherEscrow, isSigner: false, isWritable: false },
            { pubkey: cranker, isSigner: false, isWritable: true },
            { pubkey: paymentVault, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([
            instructionDiscriminator("tsn_claim_vault_recovery"),
            encodeU64(params.paymentIntentId),
        ]),
    });
    const signature = await sendAndConfirmTransaction(connection, new Transaction({ feePayer: params.operator.publicKey }).add(ix), [params.operator], { commitment: "confirmed" });
    logger.info("tsn.vault.recovery_lease_claimed", {
        paymentVault: paymentVault.toBase58(),
        cranker: cranker.toBase58(),
        signature,
    });
    return { mode: "devnet", signature, paymentVault: paymentVault.toBase58() };
}
export async function tsnRecoverPaymentVaultOnChain(params) {
    const connection = getConnection(params.rpcUrl);
    const motherEscrow = getTsnMotherEscrowPda();
    const recoveryCranker = getTsnCrankerPda({
        motherEscrow,
        operator: params.operator.publicKey,
    });
    const settlementCranker = getTsnCrankerPda({
        motherEscrow,
        operator: params.settlementCrankerOperator,
    });
    const paymentVault = getTsnPaymentVaultPda(params.paymentIntentId);
    const paymentVaultTokenAccount = getAssociatedTokenAddressSync(params.tokenMint, paymentVault, true);
    const settlementCrankerVault = getTsnCrankerVaultPda({
        cranker: settlementCranker,
        tokenMint: params.tokenMint,
    });
    const settlementVaultTokenAccount = getTsnCrankerVaultTokenPda({
        crankerVault: settlementCrankerVault,
    });
    const verifierPda = getTsnVerifierPda();
    const ix = new TransactionInstruction({
        programId: getVerifiedTsnProgramId(),
        keys: [
            { pubkey: params.operator.publicKey, isSigner: true, isWritable: true },
            { pubkey: motherEscrow, isSigner: false, isWritable: false },
            { pubkey: recoveryCranker, isSigner: false, isWritable: true },
            { pubkey: paymentVault, isSigner: false, isWritable: true },
            { pubkey: paymentVaultTokenAccount, isSigner: false, isWritable: true },
            { pubkey: settlementCrankerVault, isSigner: false, isWritable: true },
            { pubkey: settlementVaultTokenAccount, isSigner: false, isWritable: true },
            { pubkey: verifierPda, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([
            instructionDiscriminator("tsn_recover_payment_vault"),
            encodeU64(params.paymentIntentId),
        ]),
    });
    const signature = await sendAndConfirmTransaction(connection, new Transaction({ feePayer: params.operator.publicKey }).add(ix), [params.operator], { commitment: "confirmed" });
    logger.info("tsn.vault.recovered", {
        paymentVault: paymentVault.toBase58(),
        recoveryCranker: recoveryCranker.toBase58(),
        settlementCranker: settlementCranker.toBase58(),
        signature,
    });
    return { mode: "devnet", signature, paymentVault: paymentVault.toBase58() };
}
export async function tsnFetchIntentOnChain(params) {
    const connection = getConnection(params.rpcUrl);
    const info = await connection.getAccountInfo(params.intent, "confirmed");
    if (!info?.data)
        return null;
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
export async function tsnFetchMotherEscrowOnChain(rpcUrl) {
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
    if (data.length < 8 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 2 + 8 + 8 + 1) {
        return { ...base, valid: false, reason: "account-too-small" };
    }
    const expectedDiscriminator = createHash("sha256")
        .update("account:MotherEscrow")
        .digest()
        .subarray(0, 8);
    const actualDiscriminator = data.subarray(0, 8);
    if (!actualDiscriminator.equals(expectedDiscriminator)) {
        return {
            ...base,
            valid: false,
            reason: "wrong-discriminator",
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
    const epochId = data.readBigUInt64LE(offset);
    offset += 8;
    const lastEpochSettledTs = data.readBigInt64LE(offset);
    offset += 8;
    const bump = data.readUInt8(offset);
    return {
        ...base,
        valid: true,
        authority: authority.toBase58(),
        tinsProgramId: tinsProgramId.toBase58(),
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
