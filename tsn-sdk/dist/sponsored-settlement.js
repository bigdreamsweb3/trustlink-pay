import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, clusterApiUrl, } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createTransferCheckedInstruction, getAssociatedTokenAddressSync, } from "@solana/spl-token";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { Buffer } from "buffer";
import { VERIFIED_TSN_PROGRAM_ID } from "./program.js";
const TSN_VERIFIER_SEED = utf8ToBytes("verifier");
const TSN_TREASURY_SEED = utf8ToBytes("tsn_treasury");
const TSN_PAYMENT_VAULT_SEED = utf8ToBytes("vault");
function concatBytes(parts) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }
    return output;
}
function encodeU64(value) {
    if (value < 0n || value > 0xffffffffffffffffn) {
        throw new Error("u64 value is out of range");
    }
    const output = new Uint8Array(8);
    let remaining = value;
    for (let index = 0; index < output.length; index += 1) {
        output[index] = Number(remaining & 0xffn);
        remaining >>= 8n;
    }
    return output;
}
function bytesToBase64(bytes) {
    if (typeof btoa === "function") {
        let binary = "";
        const chunkSize = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
        }
        return btoa(binary);
    }
    return Buffer.from(bytes).toString("base64");
}
function hexToBytes(value, label) {
    const normalized = value.trim();
    if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
        throw new Error(`${label} must be a hex string`);
    }
    const output = new Uint8Array(normalized.length / 2);
    for (let index = 0; index < output.length; index += 1) {
        output[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
    }
    return output;
}
export function uiAmountToBaseUnits(amountUi, decimals) {
    if (!Number.isInteger(decimals) || decimals < 0) {
        throw new Error("token decimals must be a non-negative integer");
    }
    const raw = String(amountUi).trim();
    if (!/^\d+(\.\d+)?$/.test(raw)) {
        throw new Error(`Invalid token amount: ${raw}`);
    }
    const [whole, fraction = ""] = raw.split(".");
    const normalizedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(normalizedFraction || "0");
}
export function tsnInstructionDiscriminator(name) {
    return sha256(utf8ToBytes(`global:${name}`)).subarray(0, 8);
}
export function paymentIdToU64(paymentId) {
    const hash = sha256(utf8ToBytes(paymentId));
    let value = 0n;
    for (let index = 0; index < 8; index += 1) {
        value |= BigInt(hash[index]) << (8n * BigInt(index));
    }
    return value;
}
export function getSponsoredSettlementPdas(params) {
    const programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID);
    const crankerOperator = params.crankerFeePayer instanceof PublicKey
        ? params.crankerFeePayer
        : new PublicKey(params.crankerFeePayer);
    const mint = params.tokenMintAddress instanceof PublicKey
        ? params.tokenMintAddress
        : new PublicKey(params.tokenMintAddress);
    const intentSeed32 = params.intentSeedHash
        ? hexToBytes(params.intentSeedHash, "intentSeedHash")
        : sha256(utf8ToBytes(params.paymentId));
    if (intentSeed32.length !== 32) {
        throw new Error("intentSeedHash must decode to 32 bytes");
    }
    const paymentIntentId = paymentIdToU64(params.paymentId);
    const verifierPda = PublicKey.findProgramAddressSync([TSN_VERIFIER_SEED], programId)[0];
    const treasuryPda = PublicKey.findProgramAddressSync([TSN_TREASURY_SEED], programId)[0];
    const treasuryTokenAccount = getAssociatedTokenAddressSync(mint, treasuryPda, true);
    const paymentVault = PublicKey.findProgramAddressSync([TSN_PAYMENT_VAULT_SEED, encodeU64(paymentIntentId)], programId)[0];
    const paymentVaultTokenAccount = getAssociatedTokenAddressSync(mint, paymentVault, true);
    return {
        programId,
        crankerOperator,
        mint,
        intentSeed32,
        intentSeedHash: bytesToHex(intentSeed32),
        paymentIntentId,
        verifierPda,
        treasuryPda,
        treasuryTokenAccount,
        paymentVault,
        paymentVaultTokenAccount,
    };
}
export async function buildTsnSponsoredSettlementTransaction(params) {
    const connection = new Connection(params.rpcUrl ?? clusterApiUrl("devnet"), "confirmed");
    const senderWallet = new PublicKey(params.senderWallet);
    if (hexToBytes(params.recipientHash, "recipientHash").length !== 32) {
        throw new Error("recipientHash must be a 32-byte hex string");
    }
    const pdas = getSponsoredSettlementPdas({
        paymentId: params.paymentId,
        crankerFeePayer: params.crankerFeePayer,
        tokenMintAddress: params.tokenMintAddress,
        intentSeedHash: params.intentSeedHash,
    });
    const senderTokenAccount = getAssociatedTokenAddressSync(pdas.mint, senderWallet);
    const amountBaseUnits = uiAmountToBaseUnits(params.amountUi, params.tokenDecimals);
    const senderFeeAmountBaseUnits = uiAmountToBaseUnits(params.senderFeeAmountUi ?? 0, params.tokenDecimals);
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    const processPaymentIntentIx = new TransactionInstruction({
        programId: pdas.programId,
        keys: [
            { pubkey: pdas.crankerOperator, isSigner: true, isWritable: true },
            { pubkey: pdas.verifierPda, isSigner: false, isWritable: true },
            { pubkey: pdas.paymentVault, isSigner: false, isWritable: true },
            { pubkey: pdas.paymentVaultTokenAccount, isSigner: false, isWritable: true },
            { pubkey: pdas.mint, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(concatBytes([
            tsnInstructionDiscriminator("tsn_process_payment_intent"),
            encodeU64(pdas.paymentIntentId),
            encodeU64(amountBaseUnits),
        ])),
    });
    const lockFundsIx = createTransferCheckedInstruction(senderTokenAccount, pdas.mint, pdas.paymentVaultTokenAccount, senderWallet, amountBaseUnits, params.tokenDecimals);
    const transferSenderFeeIx = senderFeeAmountBaseUnits > 0n
        ? createTransferCheckedInstruction(senderTokenAccount, pdas.mint, pdas.treasuryTokenAccount, senderWallet, senderFeeAmountBaseUnits, params.tokenDecimals)
        : null;
    const transaction = new Transaction({
        feePayer: pdas.crankerOperator,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }).add(processPaymentIntentIx, lockFundsIx, ...(transferSenderFeeIx ? [transferSenderFeeIx] : []));
    return {
        transactionBase64: bytesToBase64(transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        })),
        intentSeedHash: pdas.intentSeedHash,
        paymentIntentId: pdas.paymentIntentId.toString(),
        paymentVault: pdas.paymentVault.toBase58(),
        paymentVaultTokenAccount: pdas.paymentVaultTokenAccount.toBase58(),
        senderTokenAccount: senderTokenAccount.toBase58(),
        crankerFeePayer: pdas.crankerOperator.toBase58(),
        verifierPda: pdas.verifierPda.toBase58(),
        treasuryPda: pdas.treasuryPda.toBase58(),
        treasuryTokenAccount: pdas.treasuryTokenAccount.toBase58(),
        amountBaseUnits: amountBaseUnits.toString(),
        senderFeeAmountBaseUnits: senderFeeAmountBaseUnits.toString(),
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    };
}
