import { PublicKey } from "@solana/web3.js";
export declare const TSN_MOTHER_ESCROW_SEED: Buffer<ArrayBuffer>;
export declare const TSN_INTENT_SEED: Buffer<ArrayBuffer>;
export declare const TSN_CRANKER_SEED: Buffer<ArrayBuffer>;
export declare function motherEscrowPda(programId?: PublicKey): [PublicKey, number];
export declare function intentPda(motherEscrow: PublicKey, intentId: Uint8Array, programId?: PublicKey): [PublicKey, number];
export declare function crankerPda(motherEscrow: PublicKey, operator: PublicKey, programId?: PublicKey): [PublicKey, number];
//# sourceMappingURL=tsnPdas.d.ts.map