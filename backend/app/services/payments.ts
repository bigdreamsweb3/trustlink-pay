import {
  createPaymentRecord,
  findPaymentById,
  findPaymentByDepositSignature,
  listPaymentHistory,
  listPendingPaymentsByPhoneNumber,
  markPaymentNotificationAttempt,
  updatePaymentAcceptance,
  updatePaymentNotificationMessageId,
  updatePaymentNotificationStatus
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
  sendPaymentClaimedMessage,
  sendPaymentNotification
} from "@/app/services/whatsapp";
import { verifyPhoneOtp } from "@/app/services/phone-verification";
import type { PaymentRecord } from "@/app/types/payment";

const NOTIFICATION_RETRY_INTERVAL_MS = 90_000;
const inFlightNotificationRetries = new Set<string>();

function canRetryPaymentNotification(payment: PaymentRecord) {
  if (payment.status !== "pending") {
    return false;
  }

  if (payment.notification_status !== "queued" && payment.notification_status !== "failed") {
    return false;
  }

  if (!payment.notification_last_attempt_at) {
    return true;
  }

  return Date.now() - new Date(payment.notification_last_attempt_at).getTime() >= NOTIFICATION_RETRY_INTERVAL_MS;
}

async function dispatchPaymentNotification(payment: PaymentRecord, reason: "initial" | "retry") {
  if (inFlightNotificationRetries.has(payment.id)) {
    return payment;
  }

  inFlightNotificationRetries.add(payment.id);

  try {
    await markPaymentNotificationAttempt(payment.id);
    const notification = await sendPaymentNotification({
      phoneNumber: payment.receiver_phone,
      amount: Number(payment.amount),
      token: payment.token_symbol,
      paymentId: payment.id,
      senderDisplayName: payment.sender_display_name_snapshot,
      senderHandle: payment.sender_handle_snapshot,
      referenceCode: payment.reference_code
    });

    if (!notification?.messageId) {
      throw new Error("WhatsApp API did not return a message id");
    }

    const updatedPayment = await updatePaymentNotificationMessageId(payment.id, notification.messageId);

    logger.info("payment.notification_dispatch_succeeded", {
      paymentId: payment.id,
      reason,
      messageId: notification.messageId
    });

    return updatedPayment ?? payment;
  } catch (error) {
    const updatedPayment = await updatePaymentNotificationStatus(payment.id, "failed");

    logger.warn("payment.notification_dispatch_failed", {
      paymentId: payment.id,
      reason,
      error: error instanceof Error ? error.message : "Unknown error"
    });

    return updatedPayment ?? payment;
  } finally {
    inFlightNotificationRetries.delete(payment.id);
  }
}

export async function retryPaymentNotificationIfNeeded(payment: PaymentRecord) {
  if (!canRetryPaymentNotification(payment)) {
    return payment;
  }

  return dispatchPaymentNotification(payment, "retry");
}

async function retryOutstandingNotifications(payments: PaymentRecord[]) {
  const retriablePayments = payments.filter(canRetryPaymentNotification);

  if (retriablePayments.length === 0) {
    return payments;
  }

  const refreshedPayments = new Map<string, PaymentRecord>();

  await Promise.all(
    retriablePayments.map(async (payment) => {
        const updated = await retryPaymentNotificationIfNeeded(payment);
      refreshedPayments.set(payment.id, updated);
    })
  );

  return payments.map((payment) => refreshedPayments.get(payment.id) ?? payment);
}

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

  if (params.depositSignature) {
    const existingPayment = await findPaymentByDepositSignature(params.depositSignature);

    if (existingPayment) {
      const updatedPayment = canRetryPaymentNotification(existingPayment)
        ? await dispatchPaymentNotification(existingPayment, "retry")
        : existingPayment;

      logger.info("payment.create.duplicate_deposit_signature", {
        paymentId: existingPayment.id,
        depositSignature: params.depositSignature
      });

      return {
        payment: updatedPayment,
        blockchain: {
          escrowAccount: updatedPayment.escrow_account ?? "",
          signature: updatedPayment.deposit_signature
        },
        notificationRetried: updatedPayment.notification_status === "queued" || updatedPayment.notification_status === "failed"
      };
    }
  }

  const phoneHash = sha256(params.phoneNumber);
  const escrow = await createEscrowPayment({
    senderWallet: params.senderWallet,
    phoneHash,
    amount: params.amount,
    token: params.token,
    depositSignature: params.depositSignature
  });

  let payment: PaymentRecord;

  try {
    payment = await createPaymentRecord({
      senderUserId: sender.id,
      senderWallet: params.senderWallet,
      senderDisplayNameSnapshot: sender.display_name,
      senderHandleSnapshot: sender.trustlink_handle,
      referenceCode: generatePaymentReference(),
      receiverPhone: params.phoneNumber,
      receiverPhoneHash: phoneHash,
      tokenSymbol: params.token,
      amount: params.amount,
      escrowAccount: escrow.escrowAccount,
      depositSignature: escrow.signature
    });
  } catch (error) {
    if (
      params.depositSignature &&
      error instanceof Error &&
      /duplicate key|deposit_signature|idx_payments_deposit_signature/i.test(error.message)
    ) {
      const existingPayment = await findPaymentByDepositSignature(params.depositSignature);

      if (existingPayment) {
        const updatedPayment = canRetryPaymentNotification(existingPayment)
          ? await dispatchPaymentNotification(existingPayment, "retry")
          : existingPayment;

        logger.info("payment.create.duplicate_deposit_signature_race", {
          paymentId: existingPayment.id,
          depositSignature: params.depositSignature
        });

        return {
          payment: updatedPayment,
          blockchain: {
            escrowAccount: updatedPayment.escrow_account ?? escrow.escrowAccount,
            signature: updatedPayment.deposit_signature ?? escrow.signature
          },
          notificationRetried: updatedPayment.notification_status === "queued" || updatedPayment.notification_status === "failed"
        };
      }
    }

    throw error;
  }

  const updatedPayment = await dispatchPaymentNotification(payment, "initial");

  logger.info("payment.create.succeeded", {
    paymentId: payment.id,
    escrowAccount: payment.escrow_account,
    status: updatedPayment?.status,
    notificationMessageId: updatedPayment?.notification_message_id ?? null,
    referenceCode: payment.reference_code
  });

  return {
    payment: updatedPayment ?? payment,
    blockchain: escrow,
    notificationRetried: updatedPayment.notification_status === "queued" || updatedPayment.notification_status === "failed"
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

  const updatedPayment = await updatePaymentAcceptance({
    id: payment.id,
    releaseSignature: release.signature,
    releasedToWallet: receiverWalletAddress
  });
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
  const payments = await listPendingPaymentsByPhoneNumber(phoneNumber);
  return retryOutstandingNotifications(payments);
}

export async function listPaymentHistoryForUser(authUser: AuthenticatedUser, limit?: number) {
  const payments = await listPaymentHistory({
    userId: authUser.id,
    phoneNumber: authUser.phoneNumber,
    limit
  });

  return retryOutstandingNotifications(payments);
}
