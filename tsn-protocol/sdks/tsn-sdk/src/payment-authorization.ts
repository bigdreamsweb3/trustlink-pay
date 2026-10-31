import {
  buildCreateIntentRequest,
  type CreateIntentRequest,
} from "./contracts.js";
import {
  buildPaymentIntentMessage,
  buildCrossChainPaymentIntentMessage,
  parseTokenAmountToBaseUnits,
  type VerifiedRecipientCredential,
} from "./canonical-message.js";
import type { Connection, PublicKey } from "@solana/web3.js";
import {
  GPRU_TCAP_PROGRAM_ID,
  resolveTcapGpruDepositAccounts,
} from "./tcap-gpru-credit.js";

export function createSenderPaymentAuthorizationMessage(params: {
  senderWallet: string;
  senderIdentity: string;
  receiverIdentity: string;
  recipientDisplayName?: string;
  recipientDisplayNameSource?: "owner-provided" | "not provided";
  recipientVerifiedCredentials?: readonly VerifiedRecipientCredential[];
  tokenMintAddress: string;
  /** Decimals from the active TCAP asset entry. */
  tokenDecimals: number;
  amount: string | number;
  senderFeeAmount: string | number;
  totalTokenRequiredUi: number;
  nonce?: string;
  issuedAt: string;
  expiresAt?: string;
  fundingMode?: "tcap_deposit_v2";
}) {
  const recipientTin =
    params.receiverIdentity.match(/(?:^|\|)tin:(\d+)/)?.[1] ??
    params.receiverIdentity.match(/^tin:(\d+)/)?.[1];
  if (!recipientTin) {
    throw new Error(
      "recipient TIN is required for canonical TSN payment authorization",
    );
  }
  const decimals = params.tokenDecimals;
  const amountBaseUnits = parseTokenAmountToBaseUnits(params.amount, decimals);
  const feeBaseUnits = parseTokenAmountToBaseUnits(params.senderFeeAmount, decimals, { allowZero: true });
  return buildPaymentIntentMessage({
    amountBaseUnits,
    tokenMintAddress: params.tokenMintAddress,
    tokenDecimals: decimals,
    recipientTin,
    recipientDisplayName: params.recipientDisplayName,
    recipientDisplayNameSource: params.recipientDisplayNameSource,
    recipientVerifiedCredentials: params.recipientVerifiedCredentials,
    feeBaseUnits,
    sender: "Main Wallet",
    nonce: params.nonce ?? "",
    expires:
      params.expiresAt ?? new Date(Date.now() + 5 * 60_000).toISOString(),
  });
}

export function createPaymentAuthorizationNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function createPaymentAuthorizationExpiry(ttlMs = 5 * 60_000) {
  return new Date(Date.now() + ttlMs).toISOString();
}

export function createPaymentAuthorization(params: {
  senderWallet: string;
  senderIdentity: string;
  receiverIdentity: string;
  recipientDisplayName?: string;
  recipientDisplayNameSource?: "owner-provided" | "not provided";
  recipientVerifiedCredentials?: readonly VerifiedRecipientCredential[];
  tokenMintAddress: string;
  /** Decimals from the active TCAP asset entry. */
  tokenDecimals: number;
  amount: string | number;
  senderFeeAmount: string | number;
  totalTokenRequiredUi: number;
  nonce?: string;
  issuedAt?: string;
  expiresAt?: string;
  fundingMode?: "tcap_deposit_v2";
}) {
  const nonce = params.nonce ?? createPaymentAuthorizationNonce();
  const issuedAt = params.issuedAt ?? new Date().toISOString();
  const expiresAt = params.expiresAt ?? createPaymentAuthorizationExpiry();
  const amountBaseUnits = parseTokenAmountToBaseUnits(params.amount, params.tokenDecimals);
  const feeBaseUnits = parseTokenAmountToBaseUnits(params.senderFeeAmount, params.tokenDecimals, { allowZero: true });
  const message = createSenderPaymentAuthorizationMessage({
    ...params,
    nonce,
    issuedAt,
    expiresAt,
  });

  return {
    message,
    amountBaseUnits: amountBaseUnits.toString(),
    feeBaseUnits: feeBaseUnits.toString(),
    nonce,
    issuedAt,
    expiresAt,
  };
}

/** Resolve the active TCAP asset first, then sign using its registered mint and decimals. */
export async function createTcapAssetPaymentAuthorization(
  params: Omit<Parameters<typeof createPaymentAuthorization>[0], "tokenMintAddress" | "tokenDecimals">
    & { connection: Connection; depositor: PublicKey; mint: PublicKey; tcapProgramId?: PublicKey },
) {
  const mintAccount = await params.connection.getAccountInfo(params.mint, "confirmed");
  if (!mintAccount) throw new Error("TOKEN_MINT_ACCOUNT_NOT_FOUND");
  const tokenProgram = mintAccount.owner;
  const asset = await resolveTcapGpruDepositAccounts(params.connection, {
    depositor: params.depositor,
    mint: params.mint,
    tokenProgram,
    tcapProgramId: params.tcapProgramId ?? GPRU_TCAP_PROGRAM_ID,
  });
  const authorization = createPaymentAuthorization({
    ...params,
    tokenMintAddress: params.mint.toBase58(),
    tokenDecimals: asset.decimals,
  });
  return {
    ...authorization,
    asset: {
      tokenId: asset.tokenId,
      mint: params.mint.toBase58(),
      tokenProgram: tokenProgram.toBase58(),
      decimals: asset.decimals,
      assetEntry: asset.assetEntry.toBase58(),
    },
  };
}

export function createCrossChainPaymentAuthorization(params: {
  intentId: string;
  senderWallet: string;
  senderIdentity: string;
  receiverIdentity: string;
  tokenMintAddress: string;
  destinationToken: string;
  amount: string | number;
  senderFeeAmount: string | number;
  nonce?: string;
  issuedAt?: string;
  expiresAt?: string;
  destinationNetwork: string;
  destinationExecutor: string;
  settlementRouteId: string;
}) {
  const nonce = params.nonce ?? createPaymentAuthorizationNonce();
  const issuedAt = params.issuedAt ?? new Date().toISOString();
  const expiresAt = params.expiresAt ?? createPaymentAuthorizationExpiry();
  const recipientTin =
    params.receiverIdentity.match(/(?:^|\|)tin:(\d+)/)?.[1] ??
    params.receiverIdentity.match(/^tin:(\d+)/)?.[1];
  if (!recipientTin) throw new Error("recipient TIN is required for canonical TSN payment authorization");
  const message = buildCrossChainPaymentIntentMessage({
    intentId: params.intentId,
    amountBaseUnits: parseTokenAmountToBaseUnits(params.amount, 6),
    destinationToken: params.destinationToken,
    recipientTin,
    feeBaseUnits: parseTokenAmountToBaseUnits(params.senderFeeAmount, 6, { allowZero: true }),
    sender: "Main Wallet",
    nonce,
    expires: expiresAt,
    destinationNetwork: params.destinationNetwork,
    destinationExecutor: params.destinationExecutor,
    settlementRouteId: params.settlementRouteId,
  });
  return { message, nonce, issuedAt, expiresAt };
}

export function buildPaymentAuthorizationIntentRequest(params: {
  paymentId: string;
  recipientHash: string;
  recipientTin: string;
  tokenMintAddress: string;
  tokenDecimals: number;
  senderWallet: string;
  senderAuthorizationMessage: string;
  senderAuthorizationSignature: string;
  senderAuthorizationNonce: string;
  senderAuthorizationIssuedAt: string;
  senderAuthorizationExpiresAt: string;
  senderFeeAmount?: string | number | null;
  senderSignedFundingTransaction: string;
  senderFundingMode: "tcap_deposit_v2";
  amount: string | number;
  destinationNetwork?: string | null;
  destinationExecutor?: string | null;
  destinationToken?: string | null;
  settlementRouteId?: string | null;
  recipientAmount?: number;
  source?: string;
}): CreateIntentRequest {
  const decimals = params.tokenDecimals;
  const amountBaseUnits = parseTokenAmountToBaseUnits(params.amount, decimals);
  const requestAmount = Number(params.amount);
  if (!Number.isFinite(requestAmount) || parseTokenAmountToBaseUnits(String(requestAmount), decimals) !== amountBaseUnits) {
    throw new Error("Payment amount cannot be represented exactly in the TSN intent request");
  }
  const feeValue = params.senderFeeAmount ?? 0;
  const feeBaseUnits = parseTokenAmountToBaseUnits(feeValue, decimals, { allowZero: true });
  const requestFee = Number(feeValue);
  if (!Number.isFinite(requestFee) || parseTokenAmountToBaseUnits(String(requestFee), decimals, { allowZero: true }) !== feeBaseUnits) {
    throw new Error("Sender fee cannot be represented exactly in the TSN intent request");
  }
  return {
    ...buildCreateIntentRequest({
      paymentId: params.paymentId,
      senderWallet: params.senderWallet,
      senderAuthorizationMessage: params.senderAuthorizationMessage,
      senderAuthorizationSignature: params.senderAuthorizationSignature,
      senderAuthorizationNonce: params.senderAuthorizationNonce,
      senderAuthorizationIssuedAt: params.senderAuthorizationIssuedAt,
      senderAuthorizationExpiresAt: params.senderAuthorizationExpiresAt,
      senderFeeAmount: params.senderFeeAmount == null ? null : requestFee,
      senderSignedFundingTransaction: params.senderSignedFundingTransaction,
      senderFundingMode: params.senderFundingMode,
      recipientHash: params.recipientHash,
      recipientTin: params.recipientTin,
      tokenMintAddress: params.tokenMintAddress,
      amount: requestAmount,
      destinationNetwork: params.destinationNetwork,
      destinationExecutor: params.destinationExecutor,
      destinationToken: params.destinationToken,
      settlementRouteId: params.settlementRouteId,
      source: params.source,
    }),
    ...(params.recipientAmount == null
      ? {}
      : { recipientAmount: params.recipientAmount }),
  };
}
