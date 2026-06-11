import { Buffer } from "buffer";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
export declare const DEFAULT_TINS_PROGRAM_ID = "TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT";
export declare const TINS_PROGRAM_SALT = "TINS_SALT_2026";
export type TinSocialIdentityType = "whatsapp" | "x" | "email" | "telegram" | "discord" | string;
export type TinEncryptedSocialIdentity = {
    identityType: TinSocialIdentityType;
    label: string;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
    metadata: string;
    verifiedBy: PublicKey | null;
    proofHash: Uint8Array;
    linkedAt: bigint;
};
export type TinEncryptedSensitiveField = {
    fieldType: "kyc_document_hash" | string;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
    metadata: string;
    proofHash: Uint8Array;
    linkedAt: bigint;
};
export type TinIdentityRegistry = {
    version: number;
    bump: number;
    status: number;
    tin: bigint;
    authority: PublicKey;
    masterPrivacy: PublicKey;
    lastEscrowId: bigint;
    createdAt: bigint;
    name: string;
    socialIdentities: TinEncryptedSocialIdentity[];
    sensitiveFields: TinEncryptedSensitiveField[];
};
export type TinResolvedIdentity = {
    tin: string;
    name: string;
    authority: PublicKey;
    socialIdentities: Array<{
        type: TinSocialIdentityType;
        label: string;
        value: string;
        metadata: unknown;
        verifiedBy: string | null;
        linkedAt: string;
    }>;
    sensitiveFields: Array<{
        type: string;
        value: string;
        metadata: unknown;
        linkedAt: string;
    }>;
    encryptedSensitiveFields: TinEncryptedSensitiveField[];
};
export declare function getTinsIdentitySeed(walletPubkey: PublicKey): Buffer;
export declare function getTinsGlobalStatePda(programId?: PublicKey | string | null): PublicKey;
export declare function getTinsIdentityPda(params: {
    walletPubkey: PublicKey;
    programId?: PublicKey | string | null;
}): PublicKey;
export declare function getTinsRegistryPda(params: {
    tin: bigint | number | string;
    programId?: PublicKey | string | null;
}): PublicKey;
export declare function getTinsPlatformRegistryPda(programId?: PublicKey | string | null): PublicKey;
export declare function buildCreateTinInstruction(params: {
    payer: PublicKey;
    identity: PublicKey;
    displayName: string;
    encryptedPhone: Uint8Array;
    programId?: PublicKey | string | null;
}): TransactionInstruction;
export declare function buildInitializePlatformRegistryInstruction(params: {
    authority: PublicKey;
    platformRegistry?: PublicKey;
    programId?: PublicKey | string | null;
}): TransactionInstruction;
export declare function buildUpsertVerificationPlatformInstruction(params: {
    authority: PublicKey;
    platformId: string;
    platformPubkey: PublicKey;
    rotatedFrom?: PublicKey | null;
    platformRegistry?: PublicKey;
    programId?: PublicKey | string | null;
}): TransactionInstruction;
export declare function buildRemoveVerificationPlatformInstruction(params: {
    authority: PublicKey;
    platformPubkey: PublicKey;
    platformRegistry?: PublicKey;
    programId?: PublicKey | string | null;
}): TransactionInstruction;
export declare function buildLinkSocialIdentityInstruction(params: {
    owner: PublicKey;
    registry: PublicKey;
    identityType: TinSocialIdentityType;
    label?: string;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
    metadata?: string;
    programId?: PublicKey | string | null;
}): TransactionInstruction;
export declare function buildLinkSensitiveFieldInstruction(params: {
    owner: PublicKey;
    registry: PublicKey;
    fieldType: string;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
    metadata?: string;
    userAuthorizationHash: Uint8Array;
    programId?: PublicKey | string | null;
}): TransactionInstruction;
export declare function buildPlatformSignedProofMessage(params: {
    tin: bigint | number | string;
    identityType: string;
    label?: string;
    encryptedPayloadHash: Uint8Array;
    subjectWallet: PublicKey;
    issuedAt: bigint | number;
}): Buffer<ArrayBuffer>;
export declare function buildLinkVerifiedSocialIdentityInstructions(params: {
    owner: PublicKey;
    registry: PublicKey;
    platformPubkey: PublicKey;
    platformSignature: Uint8Array;
    proofMessage: Uint8Array;
    identityType: TinSocialIdentityType;
    label?: string;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
    metadata?: string;
    platformRegistry?: PublicKey;
    programId?: PublicKey | string | null;
}): TransactionInstruction[];
export declare function decodeTinAccount(data: Uint8Array): {
    tin: bigint;
    displayName: string;
    identityPubkey: PublicKey;
    encryptedPhone: Buffer<ArrayBuffer>;
    createdAt: bigint;
};
export declare function decodeTinsIdentityRegistry(data: Uint8Array): TinIdentityRegistry;
export declare function deriveTinSocialKey(tin: bigint | number | string): Uint8Array<ArrayBufferLike>;
export declare function buildSensitiveAuthorizationMessage(params: {
    tin: bigint | number | string;
    fieldType: string;
    nonce?: string;
}): string;
export declare function deriveTinSensitiveKey(params: {
    tin: bigint | number | string;
    userSignature: Uint8Array | string;
    fieldType: string;
}): Uint8Array<ArrayBufferLike>;
export declare function encryptTinSocialIdentity(params: {
    tin: bigint | number | string;
    value: string;
    nonce?: Uint8Array;
}): Promise<{
    nonce: Uint8Array<ArrayBufferLike>;
    ciphertext: Uint8Array<ArrayBuffer>;
}>;
export declare function decryptTinSocialIdentity(params: {
    tin: bigint | number | string;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
}): Promise<string>;
export declare function encryptTinSensitiveField(params: {
    tin: bigint | number | string;
    fieldType: string;
    value: string;
    userSignature: Uint8Array | string;
    nonce?: Uint8Array;
}): Promise<{
    nonce: Uint8Array<ArrayBufferLike>;
    ciphertext: Uint8Array<ArrayBuffer>;
    userAuthorizationHash: Uint8Array<ArrayBufferLike>;
}>;
export declare function decryptTinSensitiveField(params: {
    tin: bigint | number | string;
    fieldType: string;
    nonce: Uint8Array;
    ciphertext: Uint8Array;
    userSignature: Uint8Array | string;
}): Promise<string>;
export declare function resolveTIN(params: {
    tin: bigint | number | string;
    connection: Connection;
    programId?: PublicKey | string | null;
    sensitiveAuthorizations?: Record<string, Uint8Array | string>;
}): Promise<TinResolvedIdentity>;
//# sourceMappingURL=tins.d.ts.map