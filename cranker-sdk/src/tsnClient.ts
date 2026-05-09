import type { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { crankerPda, intentPda, motherEscrowPda } from "./tsnPdas.js";

// Minimal, IDL-driven wrapper. The concrete `TrustlinkEscrow` type will come from generated IDL types.
export class TsnClient {
  constructor(readonly program: Program, readonly programId: PublicKey = program.programId) {}

  motherEscrowPda(): [PublicKey, number] {
    return motherEscrowPda(this.programId);
  }

  crankerPda(motherEscrow: PublicKey, operator: PublicKey): [PublicKey, number] {
    return crankerPda(this.programId, motherEscrow, operator);
  }

  intentPda(motherEscrow: PublicKey, intentId: Uint8Array): [PublicKey, number] {
    return intentPda(this.programId, motherEscrow, intentId);
  }

  registerCrankerIx(motherEscrow: PublicKey, operator: PublicKey) {
    const [cranker] = this.crankerPda(motherEscrow, operator);
    // @ts-expect-error IDL types not wired yet
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

