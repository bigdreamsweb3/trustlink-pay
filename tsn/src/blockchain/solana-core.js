import { createHash } from "node:crypto";
import { TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { env } from "../lib/env.js";
import { VERIFIED_TSN_PROGRAM_ID } from "../program.js";
export const TOKEN_PROGRAM_ID = SPL_TOKEN_PROGRAM_ID;
export function instructionDiscriminator(name) {
    return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}
function getSecretKey() {
    const rawValue = (env.SOLANA_CLAIM_VERIFIER_SECRET_KEY ??
        env.SOLANA_ESCROW_AUTHORITY_SECRET_KEY)?.trim();
    if (!rawValue) {
        throw new Error("Missing SOLANA_CLAIM_VERIFIER_SECRET_KEY or SOLANA_ESCROW_AUTHORITY_SECRET_KEY");
    }
    try {
        const values = JSON.parse(rawValue);
        return Uint8Array.from(values);
    }
    catch {
        if (rawValue.includes(",")) {
            const values = rawValue
                .split(",")
                .map((entry) => Number(entry.trim()))
                .filter((value) => Number.isFinite(value));
            if (values.length > 0)
                return Uint8Array.from(values);
        }
        const hashed = createHash("sha256").update(rawValue).digest();
        return Uint8Array.from(hashed);
    }
}
export function getEscrowAuthorityKeypair() {
    const secretKey = getSecretKey();
    try {
        if (secretKey.length >= 64) {
            return Keypair.fromSecretKey(secretKey.slice(0, 64));
        }
    }
    catch {
        // fall through
    }
    const seed = secretKey.length >= 32 ? secretKey.slice(0, 32) : createHash("sha256").update(secretKey).digest().slice(0, 32);
    return Keypair.fromSeed(Uint8Array.from(seed));
}
export function getConnection() {
    return new Connection(env.SOLANA_RPC_URL, "confirmed");
}
export function getProgramId() {
    return new PublicKey(VERIFIED_TSN_PROGRAM_ID);
}
export async function estimateTransactionFeeLamports(connection, transaction) {
    const fee = await connection.getFeeForMessage(transaction.compileMessage(), "confirmed");
    return fee.value ?? 0;
}
export async function getEscrowConfigState() {
    // TSN protocol module does not depend on backend escrow config storage.
    // If needed later, this can read the on-chain config account directly.
    return null;
}
