import { createPaymentAuthorization, buildPaymentAuthorizationIntentRequest } from "@trustlink/tsn-sdk/payment-authorization";

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
}) {
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
    fundingMode: "tcap_deposit_v2",
  });
  return {
    authorization,
    // Invoke only with the connected sender's signature and exact signed deposit.
    withWalletApproval(signatureBase64: string, signedDepositBase64: string) {
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
        senderSignedFundingTransaction: signedDepositBase64,
        senderFundingMode: "tcap_deposit_v2",
        amount: input.amount,
        source: "documentation-example",
      });
    },
  };
}
