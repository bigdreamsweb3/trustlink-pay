import type { Commitment, Digest, Nullifier } from "./models.js";

export interface OpaqueProof<Name extends string> {
  readonly kind: Name;
  readonly system: string;
  readonly circuitVersion: number;
  readonly bytes: Uint8Array;
}

export type FundedIntentMembershipProof = OpaqueProof<"funded-intent-membership">;
export type PublicSettlementProof = OpaqueProof<"public-settlement">;
export type ConfidentialSettlementProof = OpaqueProof<"confidential-settlement">;
export type TcapNoteSpendProof = OpaqueProof<"tcap-note-spend">;
export type RefundProof = OpaqueProof<"refund">;
export type EpochTransitionProof = OpaqueProof<"epoch-transition">;

export interface SettlementProofPublicInputs {
  epochRoot: Digest;
  previousTcapRoot: Digest;
  nextTcapRoot: Digest | null;
  nullifier: Nullifier;
  assetCommitment: Commitment;
  resultCommitments: readonly Commitment[];
}

export interface ProofVerificationRequest<P extends OpaqueProof<string>> {
  proof: P;
  publicInputs: SettlementProofPublicInputs;
}

export interface ProofVerifier {
  verify<P extends OpaqueProof<string>>(request: ProofVerificationRequest<P>): Promise<boolean>;
}

/** Phase-2 safe default: production code cannot accidentally accept an unimplemented proof. */
export class RejectingProofVerifier implements ProofVerifier {
  async verify<P extends OpaqueProof<string>>(_request: ProofVerificationRequest<P>): Promise<boolean> {
    return false;
  }
}
