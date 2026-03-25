import {
  createPaymentRecord,
  findPaymentById,
  listPaymentHistory,
  listPendingPaymentsByPhoneNumber,
  updatePaymentNotificationMessageId,
  updatePaymentStatus
} from "@/app/db/payments";
import { findReceiverWalletById } from "@/app/db/receiver-wallets";
import { findUserByPhoneNumber, updateUserWallet } from "@/app/db/users";
import { createEscrowPayment, releaseEscrow } from "@/app/blockchain/solana";
import { logger } from "@/app/lib/logger";
import { getTransactionExplorerUrl } from "@/app/utils/blockchain-explorer";
import { sha256 } from "@/app/utils/hash";
import { generatePaymentReference } from "@/app/utils/reference";
import type { AuthenticatedUser } from "@/app/types/auth";
import {
  sendIncomingTransferAlert,
  sendPaymentClaimedMessage,
  sendPaymentNotification
} from "@/app/services/whatsapp";
import { verifyPhoneOtp } from "@/app/services/phone-verification";

export async function createPayment(params: {
  phoneNumber: string;
  senderPhoneNumber: string;
  amount: number;
  token: string;
  senderWallet: string;
  depositSignature?: string;
}) {
  logger.info("payment.create.started", {
    phoneNumber: params.phoneNumber,
    amount: params.amount,
    token: params.token,
    senderWallet: params.senderWallet
  });

  const sender = await findUserByPhoneNumber(params.senderPhoneNumber);
  if (!sender) {
    throw new Error("Sender must register a TrustLink identity before creating payments");
  }

  const phoneHash = sha256(params.phoneNumber);
  const escrow = await createEscrowPayment({
    senderWallet: params.senderWallet,
    phoneHash,
    amount: params.amount,
    token: params.token,
    depositSignature: params.depositSignature,
  });

  const payment = await createPaymentRecord({
    senderUserId: sender.id,
    senderWallet: params.senderWallet,
    senderDisplayNameSnapshot: sender.display_name,
    senderHandleSnapshot: sender.trustlink_handle,
    referenceCode: generatePaymentReference(),
    receiverPhone: params.phoneNumber,
    receiverPhoneHash: phoneHash,
    tokenSymbol: params.token,
    amount: params.amount,
    escrowAccount: escrow.escrowAccount
  });

  await sendIncomingTransferAlert(params.phoneNumber, payment.reference_code);

  const notification = await sendPaymentNotification({
    phoneNumber: params.phoneNumber,
    amount: params.amount,
    token: params.token,
    paymentId: payment.id,
    senderDisplayName: payment.sender_display_name_snapshot,
    senderHandle: payment.sender_handle_snapshot,
    referenceCode: payment.reference_code
  });

  const updatedPayment =
    notification?.messageId != null
      ? await updatePaymentNotificationMessageId(payment.id, notification.messageId)
      : payment;

  logger.info("payment.create.succeeded", {
    paymentId: payment.id,
    escrowAccount: payment.escrow_account,
    status: updatedPayment?.status,
    notificationMessageId: updatedPayment?.notification_message_id ?? null,
    referenceCode: payment.reference_code
  });

  return {
    payment: updatedPayment ?? payment,
    blockchain: escrow
  };
}

export async function acceptPayment(params: {
  authUser: AuthenticatedUser;
  paymentId: string;
  otp: string;
  walletAddress?: string;
  receiverWalletId?: string;
}) {
  logger.info("payment.accept.started", {
    paymentId: params.paymentId,
    phoneNumber: params.authUser.phoneNumber,
    walletAddress: params.walletAddress ?? params.receiverWalletId
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

  await verifyPhoneOtp(params.authUser.phoneNumber, params.otp, {
    consume: true,
    purpose: "claim"
  });

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
          markPhoneVerified: true
        });

  const release = await releaseEscrow({
    paymentId: payment.id,
    escrowAccount: payment.escrow_account ?? "",
    receiverWallet: receiverWalletAddress,
    amount: Number(payment.amount),
    token: payment.token_symbol
  });

  const updatedPayment = await updatePaymentStatus(payment.id, "accepted");
  const transactionUrl = getTransactionExplorerUrl({
    chain: "solana",
    signature: release.signature
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
      transactionUrl
    });
  } catch (error) {
    logger.warn("payment.claimed_notification_failed", {
      paymentId: payment.id,
      phoneNumber: params.authUser.phoneNumber,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }

  logger.info("payment.accept.succeeded", {
    paymentId: payment.id,
    walletAddress: receiverWalletAddress,
    status: updatedPayment?.status
  });

  return {
    payment: updatedPayment,
    user,
    blockchain: release
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

  const otp = await import("@/app/services/phone-verification").then((module) =>
    module.sendPhoneVerificationOtp(params.authUser.phoneNumber, "claim")
  );

  return {
    paymentId: payment.id,
    referenceCode: payment.reference_code,
    senderDisplayName: payment.sender_display_name_snapshot,
    senderHandle: payment.sender_handle_snapshot,
    expiresAt: otp.expiresAt
  };
}

export async function listPendingPaymentsForUser(phoneNumber: string) {
  return listPendingPaymentsByPhoneNumber(phoneNumber);
}

export async function listPaymentHistoryForUser(authUser: AuthenticatedUser, limit?: number) {
  return listPaymentHistory({
    userId: authUser.id,
    phoneNumber: authUser.phoneNumber,
    limit,
  });
}
