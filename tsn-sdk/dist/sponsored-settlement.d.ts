import { PublicKey } from "@solana/web3.js";
export declare function uiAmountToBaseUnits(amountUi: number | string, decimals: number): bigint;
export declare function tsnInstructionDiscriminator(name: string): Uint8Array<ArrayBufferLike>;
export declare function paymentIdToU64(paymentId: string): bigint;
export declare function getSponsoredSettlementPdas(params: {
    paymentId: string;
    crankerFeePayer: string | PublicKey;
    tokenMintAddress: string | PublicKey;
    intentSeedHash?: string;
}): {
    programId: PublicKey;
    crankerOperator: PublicKey;
    mint: PublicKey;
    intentSeed32: Uint8Array<ArrayBufferLike>;
    intentSeedHash: string;
    paymentIntentId: bigint;
    verifierPda: PublicKey;
    treasuryPda: PublicKey;
    treasuryTokenAccount: PublicKey;
    paymentVault: PublicKey;
    paymentVaultTokenAccount: PublicKey;
};
export declare function buildTsnSponsoredSettlementTransaction(params: {
    paymentId: string;
    crankerFeePayer: string;
    senderWallet: string;
    tokenMintAddress: string;
    amountUi: number | string;
    senderFeeAmountUi?: number | string;
    tokenDecimals: number;
    recipientHash: string;
    rpcUrl?: string;
    intentSeedHash?: string;
}): Promise<{
    transactionBase64: string;
    intentSeedHash: string;
    paymentIntentId: string;
    paymentVault: string;
    paymentVaultTokenAccount: string;
    senderTokenAccount: string;
    crankerFeePayer: string;
    verifierPda: string;
    treasuryPda: string;
    treasuryTokenAccount: string;
    amountBaseUnits: string;
    senderFeeAmountBaseUnits: string;
    blockhash: string;
    lastValidBlockHeight: number;
}>;
//# sourceMappingURL=sponsored-settlement.d.ts.map