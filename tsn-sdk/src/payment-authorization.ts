function formatPaymentNumber(value: number) {
  return Number(value.toFixed(9)).toString();
}

export function createSenderPaymentAuthorizationMessage(params: {
  senderWallet: string;
  senderIdentity: string;
  receiverIdentity: string;
  tokenMintAddress: string;
  amount: number;
  senderFeeAmount: number;
  totalTokenRequiredUi: number;
  issuedAt: string;
}) {
  return [
    "Transfer Settlement Network Payment Authorization",
    "version=1",
    `senderWallet=${params.senderWallet}`,
    `senderIdentity=${params.senderIdentity}`,
    `receiverIdentity=${params.receiverIdentity}`,
    `tokenMintAddress=${params.tokenMintAddress}`,
    `amount=${formatPaymentNumber(params.amount)}`,
    `senderFeeAmount=${formatPaymentNumber(params.senderFeeAmount)}`,
    `totalTokenRequiredUi=${formatPaymentNumber(params.totalTokenRequiredUi)}`,
    `issuedAt=${params.issuedAt}`,
  ].join("\n");
}
