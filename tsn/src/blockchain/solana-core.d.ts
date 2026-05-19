import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
export declare const TOKEN_PROGRAM_ID: PublicKey;
export declare function instructionDiscriminator(name: string): Buffer<ArrayBuffer>;
export declare function getEscrowAuthorityKeypair(): Keypair;
export declare function getConnection(): Connection;
export declare function getProgramId(): PublicKey;
export declare function estimateTransactionFeeLamports(connection: Connection, transaction: Transaction): Promise<number>;
export declare function getEscrowConfigState(): Promise<{
    treasuryOwner: string | null;
} | null>;
