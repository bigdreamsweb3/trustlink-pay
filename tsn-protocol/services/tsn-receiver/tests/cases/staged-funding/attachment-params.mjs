/** Exact synthetic wire and issuing-bank tuple for the already-ready intent. */
export function attachmentParams(work, changes = {}) {
  return { id: work.id, expectedVersion: work.stateVersion, authorizationPayloadCommitment: work.authorizationPayloadCommitment,
    senderSignedFundingTransaction: "synthetic-owner-signed-deposit-wire",
    senderFundingBlockhashContext: { blockhash: "11111111111111111111111111111112", lastValidBlockHeight: 150, contextSlot: 17 }, ...changes };
}
