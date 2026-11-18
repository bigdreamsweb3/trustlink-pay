import { createPaymentAuthorization, buildPaymentAuthorizationIntentRequest } from "@trustlink/tsn-sdk/payment-authorization";
import { assertFundingNoteV1, buildCompleteTsnFundingRequest, type CreateIntentRequest, type TsnFundingReadiness, type FundingNoteV1, type SenderFundingBlockhashContext } from "@trustlink/tsn-sdk";

// Pure preparation: no RPC, signing, submission, service start, or secret lookup.
export function prepareIntent(input: {
  paymentId: string;
  recipientTin: string;
  recipientOwnerHash: string;
  senderWallet: string;
  tokenMint: string;
  tokenDecimals: number;
  amount: string;
  fee: string;
  totalTokenRequiredUi: number;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  fundingNote: FundingNoteV1;
}) {
  // One note is retained through message authorization and later funding approval.
  const fundingNote = assertFundingNoteV1(input.fundingNote);
  const authorization = createPaymentAuthorization({
    senderWallet: input.senderWallet,
    senderIdentity: input.senderWallet,
    receiverIdentity: `tin:${input.recipientTin}`,
    tokenMintAddress: input.tokenMint,
    tokenDecimals: input.tokenDecimals,
    amount: input.amount,
    senderFeeAmount: input.fee,
    totalTokenRequiredUi: input.totalTokenRequiredUi,
    nonce: input.nonce,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    fundingMode: "tcap_funded_note_v1",
    fundingNoteCommitment: fundingNote.commitment,
  });
  return {
    authorization,
    // First submit the signed message; funding has no wire or blockhash yet.
    withWalletApproval(signatureBase64: string) {
      return buildPaymentAuthorizationIntentRequest({
        paymentId: input.paymentId,
        recipientHash: input.recipientOwnerHash,
        recipientTin: input.recipientTin,
        tokenMintAddress: input.tokenMint,
        tokenDecimals: input.tokenDecimals,
        senderWallet: input.senderWallet,
        senderAuthorizationMessage: authorization.message,
        senderAuthorizationSignature: signatureBase64,
        senderAuthorizationNonce: authorization.nonce,
        senderAuthorizationIssuedAt: authorization.issuedAt,
        senderAuthorizationExpiresAt: authorization.expiresAt,
        senderFeeAmount: input.fee,
        senderFundingMode: "tcap_funded_note_v1",
        fundingNote,
        amount: input.amount,
        source: "documentation-example",
      });
    },
  };
}

// Call after Receiver FUNDING_READY and owner-authenticated Node preparation.
// The caller presents an explicit funding-approval action and fetches a fresh
// blockhash immediately before requesting the wallet transaction signature.
export function prepareFundingCompletion(input: {
  request: CreateIntentRequest;
  readiness: TsnFundingReadiness;
  workId: string;
  senderFundingDepositTxB64: string;
  senderFundingBlockhashContext: SenderFundingBlockhashContext;
}) {
  return buildCompleteTsnFundingRequest(input);
}
