import { PublicKey } from "@solana/web3.js";

import { VERIFIED_TSN_PROGRAM_ID } from "@trustlink/tsn-sdk/program";

export const TSN_MOTHER_ESCROW_SEED = Buffer.from("tsn_mother_escrow");
export const TSN_CRANKER_SEED = Buffer.from("tsn_cranker");
export const TSN_CRANKER_VAULT_SEED = Buffer.from("tsn_cranker_vault");
export const TSN_CRANKER_VAULT_TOKEN_SEED = Buffer.from("tsn_cranker_vault_token");

function programKey(programId: PublicKey = new PublicKey(VERIFIED_TSN_PROGRAM_ID)) {
  return programId;
}

export function motherEscrowPda(programId: PublicKey = new PublicKey(VERIFIED_TSN_PROGRAM_ID)): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([TSN_MOTHER_ESCROW_SEED], programKey(programId));
}

export function crankerPda(
  motherEscrow: PublicKey,
  operator: PublicKey,
  programId: PublicKey = new PublicKey(VERIFIED_TSN_PROGRAM_ID)
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TSN_CRANKER_SEED, motherEscrow.toBuffer(), operator.toBuffer()],
    programKey(programId)
  );
}

export function crankerVaultPda(
  cranker: PublicKey,
  tokenMint: PublicKey,
  programId: PublicKey = new PublicKey(VERIFIED_TSN_PROGRAM_ID),
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TSN_CRANKER_VAULT_SEED, cranker.toBuffer(), tokenMint.toBuffer()],
    programKey(programId),
  );
}

export function crankerVaultTokenPda(
  crankerVault: PublicKey,
  programId: PublicKey = new PublicKey(VERIFIED_TSN_PROGRAM_ID),
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TSN_CRANKER_VAULT_TOKEN_SEED, crankerVault.toBuffer()],
    programKey(programId),
  );
}
