import { createHash } from "node:crypto";

export const VERIFIED_TSN_PROGRAM_ID = "BQCDZF8gFs35xiEUEZbvgkLufMjrcysw5yPdv3MVZohM";
export const VERIFIED_TSN_CLUSTER = "devnet";
export const VERIFIED_TSN_PROGRAM_LABEL = "trustlink-escrow-tsn";

export function getVerifiedTsnProgramId(): string {
  return VERIFIED_TSN_PROGRAM_ID;
}

export function assertVerifiedTsnProgramId(programId: { toBase58(): string } | string): string {
  const resolved = typeof programId === "string" ? programId : programId.toBase58();
  if (resolved !== VERIFIED_TSN_PROGRAM_ID) {
    throw new Error(
      `Unverified TSN program id ${resolved}. This SDK only supports verified ${VERIFIED_TSN_PROGRAM_LABEL} ${VERIFIED_TSN_PROGRAM_ID} on ${VERIFIED_TSN_CLUSTER}. Update the TSN package to use a newer verified program.`,
    );
  }

  return resolved;
}