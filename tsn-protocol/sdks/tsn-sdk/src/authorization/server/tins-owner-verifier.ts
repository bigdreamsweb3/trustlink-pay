export interface TinsOwnerVerificationResult {
  tin: string;
  ownerIdentityCommitment: string;
  tinsAccount: string;
}

export interface TinsOwnerVerifier {
  verifyOwner(params: {
    tin: string;
    transientSignerPublicKey: string;
  }): Promise<TinsOwnerVerificationResult>;
}
