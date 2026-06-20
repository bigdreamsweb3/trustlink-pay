import { PublicKey } from "@solana/web3.js";
import { VERIFIED_TSN_PROGRAM_ID } from "../../tsn-sdk/dist/program.js";
export const TSN_MOTHER_ESCROW_SEED = Buffer.from("tsn_mother_escrow");
export const TSN_INTENT_SEED = Buffer.from("tsn_intent");
export const TSN_CRANKER_SEED = Buffer.from("tsn_cranker");
export const TSN_EPOCH_ACCOUNT_SEED = Buffer.from("tsn_epoch");
export const TSN_PEA_SEED = Buffer.from("pea");
export const TSN_PAYMENT_COMMITMENT_SEED = Buffer.from("tsn_payment_commitment");
export const TSN_PRIVACY_RECEIVE_SEED = Buffer.from("tsn_privacy_receive");
function programKey(programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID)) {
    return programId;
}
export function motherEscrowPda(programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID)) {
    return PublicKey.findProgramAddressSync([TSN_MOTHER_ESCROW_SEED], programKey(programId));
}
export function intentPda(motherEscrow, intentId, programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID)) {
    if (intentId.length !== 32)
        throw new Error("intentId must be 32 bytes");
    return PublicKey.findProgramAddressSync([TSN_INTENT_SEED, motherEscrow.toBuffer(), Buffer.from(intentId)], programKey(programId));
}
export function crankerPda(motherEscrow, operator, programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID)) {
    return PublicKey.findProgramAddressSync([TSN_CRANKER_SEED, motherEscrow.toBuffer(), operator.toBuffer()], programKey(programId));
}
export function epochAccountPda(motherEscrow, epochId, programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID)) {
    const epoch = Buffer.alloc(8);
    epoch.writeBigUInt64LE(BigInt(epochId));
    return PublicKey.findProgramAddressSync([TSN_EPOCH_ACCOUNT_SEED, motherEscrow.toBuffer(), epoch], programKey(programId));
}
export function peaPda(epochId, mint, programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID)) {
    const epoch = Buffer.alloc(8);
    epoch.writeBigUInt64LE(BigInt(epochId));
    return PublicKey.findProgramAddressSync([TSN_PEA_SEED, epoch, mint.toBuffer()], programKey(programId));
}
export function paymentCommitmentPda(epochAccount, commitmentHash, programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID)) {
    if (commitmentHash.length !== 32)
        throw new Error("commitmentHash must be 32 bytes");
    return PublicKey.findProgramAddressSync([TSN_PAYMENT_COMMITMENT_SEED, epochAccount.toBuffer(), Buffer.from(commitmentHash)], programKey(programId));
}
export function privacyReceivePda(motherEscrow, tinRouteHash, programId = new PublicKey(VERIFIED_TSN_PROGRAM_ID)) {
    if (tinRouteHash.length !== 32)
        throw new Error("tinRouteHash must be 32 bytes");
    return PublicKey.findProgramAddressSync([TSN_PRIVACY_RECEIVE_SEED, motherEscrow.toBuffer(), Buffer.from(tinRouteHash)], programKey(programId));
}
