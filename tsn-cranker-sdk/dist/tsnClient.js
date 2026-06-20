import { PublicKey } from "@solana/web3.js";
import { crankerPda, epochAccountPda, intentPda, motherEscrowPda, paymentCommitmentPda, peaPda, privacyReceivePda } from "./tsnPdas.js";
import { assertVerifiedTsnProgramId, VERIFIED_TSN_PROGRAM_ID, } from "../../tsn-sdk/dist/program.js";
// Minimal, IDL-driven wrapper. The concrete `TrustlinkEscrow` type will come from generated IDL types.
export class TsnClient {
    program;
    programId;
    constructor(program) {
        this.program = program;
        this.programId = new PublicKey(assertVerifiedTsnProgramId(program.programId ?? VERIFIED_TSN_PROGRAM_ID));
    }
    motherEscrowPda() {
        return motherEscrowPda(this.programId);
    }
    crankerPda(motherEscrow, operator) {
        return crankerPda(motherEscrow, operator, this.programId);
    }
    epochAccountPda(motherEscrow, epochId) {
        return epochAccountPda(motherEscrow, epochId, this.programId);
    }
    peaPda(epochId, mint) {
        return peaPda(epochId, mint, this.programId);
    }
    paymentCommitmentPda(epochAccount, commitmentHash) {
        return paymentCommitmentPda(epochAccount, commitmentHash, this.programId);
    }
    privacyReceivePda(motherEscrow, tinRouteHash) {
        return privacyReceivePda(motherEscrow, tinRouteHash, this.programId);
    }
    intentPda(motherEscrow, intentId) {
        return intentPda(motherEscrow, intentId, this.programId);
    }
    registerCrankerIx(motherEscrow, operator) {
        const [cranker] = this.crankerPda(motherEscrow, operator);
        return this.program.methods
            .tsnRegisterCranker()
            .accounts({ operator, motherEscrow, cranker });
    }
    claimIntentIx(motherEscrow, operator, intent) {
        const [cranker] = this.crankerPda(motherEscrow, operator);
        // @ts-ignore IDL types not wired yet
        return this.program.methods
            .tsnClaimIntent()
            .accounts({ operator, motherEscrow, intent, cranker });
    }
    reassignIntentIx(motherEscrow, intent) {
        // @ts-ignore IDL types not wired yet
        return this.program.methods
            .tsnReassignIntent()
            .accounts({ motherEscrow, intent });
    }
    submitProofIx(motherEscrow, operator, intent, payoutTxSig) {
        if (payoutTxSig.length !== 64)
            throw new Error("payoutTxSig must be 64 bytes");
        const [cranker] = this.crankerPda(motherEscrow, operator);
        // @ts-ignore IDL types not wired yet
        return this.program.methods
            .tsnSubmitProof(Array.from(payoutTxSig))
            .accounts({
            operator,
            motherEscrow,
            intent,
            cranker,
        });
    }
}
