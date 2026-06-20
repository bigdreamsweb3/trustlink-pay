import { PublicKey } from "@solana/web3.js";
export declare const TSN_MOTHER_ESCROW_SEED: Buffer<ArrayBuffer>;
export declare const TSN_INTENT_SEED: Buffer<ArrayBuffer>;
export declare const TSN_CRANKER_SEED: Buffer<ArrayBuffer>;
export declare const TSN_EPOCH_ACCOUNT_SEED: Buffer<ArrayBuffer>;
export declare const TSN_PEA_SEED: Buffer<ArrayBuffer>;
export declare const TSN_PAYMENT_COMMITMENT_SEED: Buffer<ArrayBuffer>;
export declare const TSN_PRIVACY_RECEIVE_SEED: Buffer<ArrayBuffer>;
export declare function motherEscrowPda(programId?: PublicKey): [PublicKey, number];
export declare function intentPda(motherEscrow: PublicKey, intentId: Uint8Array, programId?: PublicKey): [PublicKey, number];
export declare function crankerPda(motherEscrow: PublicKey, operator: PublicKey, programId?: PublicKey): [PublicKey, number];
export declare function epochAccountPda(motherEscrow: PublicKey, epochId: bigint | number, programId?: PublicKey): [PublicKey, number];
export declare function peaPda(epochId: bigint | number, mint: PublicKey, programId?: PublicKey): [PublicKey, number];
export declare function paymentCommitmentPda(epochAccount: PublicKey, commitmentHash: Uint8Array, programId?: PublicKey): [PublicKey, number];
export declare function privacyReceivePda(motherEscrow: PublicKey, tinRouteHash: Uint8Array, programId?: PublicKey): [PublicKey, number];
//# sourceMappingURL=tsnPdas.d.ts.map