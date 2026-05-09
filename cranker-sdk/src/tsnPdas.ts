import { PublicKey } from "@solana/web3.js";

export const TSN_MOTHER_ESCROW_SEED = Buffer.from("tsn_mother_escrow");
export const TSN_INTENT_SEED = Buffer.from("tsn_intent");
export const TSN_CRANKER_SEED = Buffer.from("tsn_cranker");

export function motherEscrowPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([TSN_MOTHER_ESCROW_SEED], programId);
}

export function intentPda(
  programId: PublicKey,
  motherEscrow: PublicKey,
  intentId: Uint8Array
): [PublicKey, number] {
  if (intentId.length !== 32) throw new Error("intentId must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [TSN_INTENT_SEED, motherEscrow.toBuffer(), Buffer.from(intentId)],
    programId
  );
}

export function crankerPda(
  programId: PublicKey,
  motherEscrow: PublicKey,
  operator: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TSN_CRANKER_SEED, motherEscrow.toBuffer(), operator.toBuffer()],
    programId
  );
}

