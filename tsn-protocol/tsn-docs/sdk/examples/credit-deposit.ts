import { Connection, PublicKey, type Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  createTcapAssetPaymentAuthorization, createFundingNoteV1, buildPaymentAuthorizationIntentRequest,
  assertSenderFundingBlockhashContext, assertTsnFundingReadiness, buildCompleteTsnFundingRequest,
  buildTcapGpruWalletDepositTransaction,
  type CreateIntentRequest, type TsnFundingReadiness, type SenderFundingBlockhashContext,
  type TcapGpruDepositAccounts, type VerifiedRecipientCredential,
} from "@trustlink/tsn-sdk";

// Resolve registered metadata and sign only the canonical message. Submit the
// returned request to Node /intents, then wait for Receiver FUNDING_READY.
export async function prepareWalletCredit(input: {
  connection: Connection;
  sender: PublicKey;
  mint: PublicKey;
  paymentId: string;
  recipientTin: string;
  recipientOwnerHash: string;
  recipientDisplayName?: string;
  recipientDisplayNameSource?: "owner-provided" | "not provided";
  recipientVerifiedCredentials?: readonly VerifiedRecipientCredential[];
  amount: string;
  senderFeeAmount: string;
  totalTokenRequiredUi: number;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}) {
  const fundingNote = createFundingNoteV1();
  const authorization = await createTcapAssetPaymentAuthorization({
    connection: input.connection, depositor: input.sender, mint: input.mint,
    senderWallet: input.sender.toBase58(), senderIdentity: input.sender.toBase58(), receiverIdentity: `tin:${input.recipientTin}`,
    recipientDisplayName: input.recipientDisplayName, recipientDisplayNameSource: input.recipientDisplayNameSource,
    recipientVerifiedCredentials: input.recipientVerifiedCredentials,
    amount: input.amount, senderFeeAmount: input.senderFeeAmount, totalTokenRequiredUi: input.totalTokenRequiredUi,
    fundingMode: "tcap_funded_note_v1", fundingNoteCommitment: fundingNote.commitment,
  });
  const signature = await input.signMessage(new TextEncoder().encode(authorization.message));
  const request = buildPaymentAuthorizationIntentRequest({
    paymentId: input.paymentId, recipientHash: input.recipientOwnerHash, recipientTin: input.recipientTin,
    tokenMintAddress: input.mint.toBase58(), tokenDecimals: authorization.asset.decimals,
    senderWallet: input.sender.toBase58(), senderAuthorizationMessage: authorization.message,
    senderAuthorizationSignature: Buffer.from(signature).toString("base64"), senderAuthorizationNonce: authorization.nonce,
    senderAuthorizationIssuedAt: authorization.issuedAt, senderAuthorizationExpiresAt: authorization.expiresAt,
    senderFeeAmount: input.senderFeeAmount, senderFundingMode: "tcap_funded_note_v1", fundingNote, amount: input.amount,
  });
  return { authorization, request };
}

// Invoke from an explicit user funding-approval action after owner-authenticated
// Node /network/funding/readiness. This prepares the completion for the same
// work; the caller sends it to /network/funding/complete and preserves it on retry.
export async function approveFunding(input: {
  request: CreateIntentRequest;
  workId: string;
  readiness: TsnFundingReadiness;
  sender: PublicKey;
  readFundingBlockhashContext: () => Promise<SenderFundingBlockhashContext>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
}) {
  if (input.sender.toBase58() !== input.request.senderWallet) throw new Error("Funding approval wallet differs from the original intent");
  const readiness = assertTsnFundingReadiness(input.readiness, input.request, input.workId);
  const context = assertSenderFundingBlockhashContext(await input.readFundingBlockhashContext());
  const accounts = Object.fromEntries(Object.entries(readiness.depositAccounts).map(([name, value]) => [name, new PublicKey(value)])) as TcapGpruDepositAccounts;
  const deposit = buildTcapGpruWalletDepositTransaction({ accounts, amountBaseUnits: BigInt(readiness.amountBaseUnits),
    fundingNoteCommitment: input.request.fundingNote.commitment });
  deposit.recentBlockhash = context.blockhash;
  deposit.lastValidBlockHeight = context.lastValidBlockHeight;
  const signed = await input.signTransaction(deposit);
  return buildCompleteTsnFundingRequest({ request: input.request, readiness, workId: input.workId,
    senderFundingDepositTxB64: Buffer.from(signed.serialize()).toString("base64"), senderFundingBlockhashContext: context });
}
