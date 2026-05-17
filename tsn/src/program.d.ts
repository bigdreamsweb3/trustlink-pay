export declare const VERIFIED_TSN_PROGRAM_ID = "BQCDZF8gFs35xiEUEZbvgkLufMjrcysw5yPdv3MVZohM";
export declare const VERIFIED_TSN_CLUSTER = "devnet";
export declare const VERIFIED_TSN_PROGRAM_LABEL = "trustlink-escrow-tsn";
export declare function getVerifiedTsnProgramId(): string;
export declare function assertVerifiedTsnProgramId(programId: {
    toBase58(): string;
} | string): string;
