import type { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { crankerPda, motherEscrowPda } from "./tsnPdas.js";
import {
  assertVerifiedTsnProgramId,
  VERIFIED_TSN_PROGRAM_ID,
} from "@trustlink/tsn-sdk/program";

// Minimal, IDL-driven wrapper. The concrete `TrustlinkEscrow` type will come from generated IDL types.
export class TsnClient {
  readonly programId: PublicKey;

  constructor(readonly program: Program) {
    this.programId = new PublicKey(
      assertVerifiedTsnProgramId(program.programId ?? VERIFIED_TSN_PROGRAM_ID),
    );
  }

  motherEscrowPda(): [PublicKey, number] {
    return motherEscrowPda(this.programId);
  }

  crankerPda(
    motherEscrow: PublicKey,
    operator: PublicKey,
  ): [PublicKey, number] {
    return crankerPda(motherEscrow, operator, this.programId);
  }

  registerCrankerIx(motherEscrow: PublicKey, operator: PublicKey) {
    const [cranker] = this.crankerPda(motherEscrow, operator);
    return this.program.methods
      .tsnRegisterCranker()
      .accounts({ operator, motherEscrow, cranker });
  }

}
