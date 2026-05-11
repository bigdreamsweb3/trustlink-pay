import type { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { crankerPda, intentPda, motherEscrowPda } from "./tsnPdas.js";
import { assertVerifiedTsnProgramId, VERIFIED_TSN_PROGRAM_ID } from "../../src/program.js";

// Minimal, IDL-driven wrapper. The concrete `TrustlinkEscrow` type will come from generated IDL types.
export class TsnClient {
  readonly programId: PublicKey;

  constructor(readonly program: Program) {
    this.programId = new PublicKey(assertVerifiedTsnProgramId(program.programId ?? VERIFIED_TSN_PROGRAM_ID));
  }

  motherEscrowPda(): [PublicKey, number] {
    return motherEscrowPda(this.programId);
  }

  crankerPda(motherEscrow: PublicKey, operator: PublicKey): [PublicKey, number] {
    return crankerPda(motherEscrow, operator, this.programId);
  }

  intentPda(motherEscrow: PublicKey, intentId: Uint8Array): [PublicKey, number] {
    return intentPda(motherEscrow, intentId, this.programId);
  }

  registerCrankerIx(motherEscrow: PublicKey, operator: PublicKey) {
    const [cranker] = this.crankerPda(motherEscrow, operator);
    return this.program.methods.tsnRegisterCranker().accounts({ operator, motherEscrow, cranker });
  }

  claimIntentIx(motherEscrow: PublicKey, operator: PublicKey, intent: PublicKey) {
    const [cranker] = this.crankerPda(motherEscrow, operator);
    // @ts-expect-error IDL types not wired yet
    return this.program.methods.tsnClaimIntent().accounts({ operator, motherEscrow, intent, cranker });
  }

  reassignIntentIx(motherEscrow: PublicKey, intent: PublicKey) {
    // @ts-expect-error IDL types not wired yet
    return this.program.methods.tsnReassignIntent().accounts({ motherEscrow, intent });
  }

  submitProofIx(
    motherEscrow: PublicKey,
    operator: PublicKey,
    intent: PublicKey,
    payoutTxSig: Uint8Array
  ) {
    if (payoutTxSig.length !== 64) throw new Error("payoutTxSig must be 64 bytes");
    const [cranker] = this.crankerPda(motherEscrow, operator);
    // @ts-expect-error IDL types not wired yet
    return this.program.methods.tsnSubmitProof(Array.from(payoutTxSig)).accounts({
      operator,
      motherEscrow,
      intent,
      cranker
    });
  }
}
