import { PublicKey } from "@solana/web3.js";

import { VERIFIED_TSN_PROGRAM_ID } from "../../tsn-sdk/dist/program.js";

export const TSN_MOTHER_ESCROW_SEED = Buffer.from("tsn_mother_escrow");
export const TSN_INTENT_SEED = Buffer.from("tsn_intent");
export const TSN_CRANKER_SEED = Buffer.from("tsn_cranker");

export function motherEscrowPda(programId: PublicKey = new PublicKey(VERIFIED_TSN_PROGRAM_ID)): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([TSN_MOTHER_ESCROW_SEED], programId);
}

export function intentPda(
  motherEscrow: PublicKey,
  intentId: Uint8Array,
  programId: PublicKey = new PublicKey(VERIFIED_TSN_PROGRAM_ID)
): [PublicKey, number] {
  if (intentId.length !== 32) throw new Error("intentId must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [TSN_INTENT_SEED, motherEscrow.toBuffer(), Buffer.from(intentId)],
    programId
  );
}

export function crankerPda(
  motherEscrow: PublicKey,
  operator: PublicKey,
  programId: PublicKey = new PublicKey(VERIFIED_TSN_PROGRAM_ID)
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TSN_CRANKER_SEED, motherEscrow.toBuffer(), operator.toBuffer()],
    programId
  );
}