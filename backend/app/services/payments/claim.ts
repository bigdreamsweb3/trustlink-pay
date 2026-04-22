import { findPaymentById } from "@/app/db/payments";
import { findReceiverWalletById } from "@/app/db/receiver-wallets";
import { findUserByPhoneNumber, updateUserWallet } from "@/app/db/users";
import { estimateClaimFee, releaseEscrow } from "@/app/blockchain/solana";
import { updatePaymentAcceptance } from "@/app/db/payments";
import { logger } from "@/app/lib/logger";
import { getTransactionExplorerUrl } from "@/app/utils/blockchain-explorer";
import { sha256 } from "@/app/utils/hash";
import type { AuthenticatedUser } from "@/app/types/auth";
import { verifyUserActionPin } from "@/app/services/auth";
import { sendPaymentClaimedMessage } from "@/app/services/whatsapp";

export async function estimatePaymentClaim(params: {
  authUser: AuthenticatedUser;
  paymentId: string;
  walletAddress?: string;
  receiverWalletId?: string;
}) {
  const payment = await findPaymentById(params.paymentId);

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (payment.status !== "pending") {
    throw new Error(`Payment is already ${payment.status}`);
  }

  if (payment.receiver_phone !== params.authUser.phoneNumber) {
    throw new Error("Signed-in account does not match payment receiver");
  }

  const existingUser = await findUserByPhoneNumber(params.authUser.phoneNumber);
  if (!existingUser || existingUser.id !== params.authUser.id) {
    throw new Error("Receiver must register a TrustLink identity before estimating claim");
  }

  const receiverWalletAddress =
    params.receiverWalletId != null
      ? (await findReceiverWalletById(params.receiverWalletId, existingUser.id))?.wallet_address
      : params.walletAddress;

  if (!receiverWalletAddress) {
    throw new Error("Receiver wallet not found");
  }

  const estimate = await estimateClaimFee({
    paymentId: payment.id,
    escrowAccount: payment.escrow_account ?? "",
    escrowVaultAddress: payment.escrow_vault_address ?? "",
    senderWallet: payment.sender_wallet ?? "",
    receiverWallet: receiverWalletAddress,
    receiverPhoneHash: payment.receiver_phone_hash,
    tokenMintAddress: payment.token_mint_address ?? "",
    amount: Number(payment.amount),
  });

  return {
    payment,
    receiverWalletAddress,
    estimate,
  };
}

export async function acceptPayment(params: {
  authUser: AuthenticatedUser;
  paymentId: string;
  pin: string;
  walletAddress?: string;
  receiverWalletId?: string;
}) {
  logger.info("payment.accept.started", {
    paymentId: params.paymentId,
    phoneNumber: params.authUser.phoneNumber,
    walletAddress: params.walletAddress ?? params.receiverWalletId,
  });

  const payment = await findPaymentById(params.paymentId);

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (payment.status !== "pending") {
    throw new Error(`Payment is already ${payment.status}`);
  }

  if (payment.receiver_phone !== params.authUser.phoneNumber) {
    throw new Error("Signed-in account does not match payment receiver");
  }

  const phoneHash = sha256(params.authUser.phoneNumber);
  const existingUser = await findUserByPhoneNumber(params.authUser.phoneNumber);
  if (!existingUser) {
    throw new Error("Receiver must register a TrustLink identity before accepting payments");
  }

  if (existingUser.id !== params.authUser.id) {
    throw new Error("Signed-in account does not match payment receiver");
  }

  await verifyUserActionPin(params.authUser, params.pin);

  const receiverWalletAddress =
    params.receiverWalletId != null
      ? (await findReceiverWalletById(params.receiverWalletId, existingUser.id))?.wallet_address
      : params.walletAddress;

  if (!receiverWalletAddress) {
    throw new Error("Receiver wallet not found");
  }

  const user =
    existingUser.wallet_address === receiverWalletAddress
      ? existingUser
      : await updateUserWallet({
          phoneNumber: params.authUser.phoneNumber,
          phoneHash,
          walletAddress: receiverWalletAddress,
          markPhoneVerified: true,
        });

  const release = await releaseEscrow({
    paymentId: payment.id,
    escrowAccount: payment.escrow_account ?? "",
    escrowVaultAddress: payment.escrow_vault_address ?? "",
    senderWallet: payment.sender_wallet ?? "",
    receiverWallet: receiverWalletAddress,
    receiverPhoneHash: payment.receiver_phone_hash,
    tokenMintAddress: payment.token_mint_address ?? "",
    amount: Number(payment.amount),
  });

  const updatedPayment = await updatePaymentAcceptance({
    id: payment.id,
    releaseSignature: release.signature,
    releasedToWallet: receiverWalletAddress,
    claimFeeAmount: release.feeAmountUi,
  });
  const transactionUrl = getTransactionExplorerUrl({
    chain: "solana",
    signature: release.signature,
  });

  try {
    await sendPaymentClaimedMessage({
      phoneNumber: params.authUser.phoneNumber,
      referenceCode: payment.reference_code,
      amount: Number(payment.amount),
      token: payment.token_symbol,
      walletAddress: receiverWalletAddress,
      senderDisplayName: payment.sender_display_name_snapshot,
      senderHandle: payment.sender_handle_snapshot,
      transactionUrl,
    });
  } catch (error) {
    logger.warn("payment.claimed_notification_failed", {
      paymentId: payment.id,
      phoneNumber: params.authUser.phoneNumber,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  logger.info("payment.accept.succeeded", {
    paymentId: payment.id,
    walletAddress: receiverWalletAddress,
    status: updatedPayment?.status,
  });

  return {
    payment: updatedPayment,
    user,
    blockchain: release,
  };
}

export async function startPaymentClaim(params: {
  paymentId: string;
  authUser: AuthenticatedUser;
}) {
  const payment = await findPaymentById(params.paymentId);

  if (!payment) {
    throw new Error("Payment not found");
  }

  if (payment.status !== "pending") {
    throw new Error(`Payment is already ${payment.status}`);
  }

  if (payment.receiver_phone !== params.authUser.phoneNumber) {
    throw new Error("Signed-in account does not match payment receiver");
  }

  const user = await findUserByPhoneNumber(params.authUser.phoneNumber);

  if (!user) {
    throw new Error("Receiver must register a TrustLink identity before claiming");
  }

  return {
    paymentId: payment.id,
    referenceCode: payment.reference_code,
    senderDisplayName: payment.sender_display_name_snapshot,
    senderHandle: payment.sender_handle_snapshot,
    expiresAt: null,
  };
}
