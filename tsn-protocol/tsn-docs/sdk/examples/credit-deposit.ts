import { Connection, PublicKey, type Transaction } from "@solana/web3.js";
import {
  createTcapAssetPaymentAuthorization,
  buildTcapGpruWalletDepositTransaction,
  resolveTcapGpruDepositAccounts,
  GPRU_TCAP_PROGRAM_ID,
} from "@trustlink/tsn-sdk";

// Preparation uses RPC reads. The caller's wallet approves both signatures.
// This function does not submit the deposit or authorize recipient settlement.
export async function prepareWalletCredit(input: {
  connection: Connection;
  sender: PublicKey;
  mint: PublicKey;
  recipientTin: string;
  amount: string;
  senderFeeAmount: string;
  totalTokenRequiredUi: number;
  recentBlockhash: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
}) {
  const authorization = await createTcapAssetPaymentAuthorization({
    connection: input.connection,
    depositor: input.sender,
    mint: input.mint,
    senderWallet: input.sender.toBase58(),
    senderIdentity: input.sender.toBase58(),
    receiverIdentity: `tin:${input.recipientTin}`,
    amount: input.amount,
    senderFeeAmount: input.senderFeeAmount,
    totalTokenRequiredUi: input.totalTokenRequiredUi,
    fundingMode: "tcap_deposit_v2",
  });
  const accounts = await resolveTcapGpruDepositAccounts(input.connection, {
    depositor: input.sender,
    mint: input.mint,
    tokenProgram: new PublicKey(authorization.asset.tokenProgram),
    tcapProgramId: GPRU_TCAP_PROGRAM_ID,
  });
  const deposit = buildTcapGpruWalletDepositTransaction({
    accounts,
    amountBaseUnits: BigInt(authorization.amountBaseUnits),
  });
  deposit.recentBlockhash = input.recentBlockhash;
  const senderMessageSignature = await input.signMessage(new TextEncoder().encode(authorization.message));
  const signedDeposit = await input.signTransaction(deposit);
  return { authorization, senderMessageSignature, signedDeposit };
}
