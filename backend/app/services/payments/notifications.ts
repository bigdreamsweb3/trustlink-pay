import { createWhatsAppWebhookEvent } from "@/app/db/whatsapp-webhook-events";
import {
  markPaymentNotificationAttempt,
  updatePaymentNotificationMessageId,
  updatePaymentNotificationStatus,
} from "@/app/db/payments";
import { logger } from "@/app/lib/logger";
import type { PaymentRecord } from "@/app/types/payment";
import { sendPaymentNotification } from "@/app/services/whatsapp";

import { buildInviteShareData, requiresManualInvite } from "./invite";

const NOTIFICATION_RETRY_INTERVAL_MS = 90_000;
const inFlightNotificationRetries = new Set<string>();

export async function resolveManualInviteState(payment: PaymentRecord) {
  const manualInviteRequired = await requiresManualInvite(payment.receiver_phone);

  if (!manualInviteRequired) {
    return {
      manualInviteRequired: false,
      payment,
      inviteShare: null,
    };
  }

  const updatedPayment =
    payment.notification_status === "failed"
      ? payment
      : (await updatePaymentNotificationStatus(payment.id, "failed")) ?? payment;

  return {
    manualInviteRequired: true,
    payment: updatedPayment,
    inviteShare: buildInviteShareData(updatedPayment),
  };
}

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
      referenceCode: payment.reference_code,
    });

    if (notification?.skipped) {
      const updatedPayment = await updatePaymentNotificationStatus(payment.id, "failed");

      logger.warn("payment.notification_dispatch_skipped", {
        paymentId: payment.id,
        reason,
        phoneNumber: payment.receiver_phone,
      });

      return updatedPayment ?? payment;
    }

    if (!notification?.messageId) {
      throw new Error("WhatsApp API did not return a message id");
    }

    const updatedPayment = await updatePaymentNotificationMessageId(payment.id, notification.messageId);

    await createWhatsAppWebhookEvent({
      eventType: "payment_notification_dispatched",
      messageId: notification.messageId,
      relatedPaymentId: payment.id,
      phoneNumber: payment.receiver_phone,
      direction: "outbound",
      status: "sent",
      payload: {
        paymentId: payment.id,
        reason,
        category: "payment_notification",
        referenceCode: payment.reference_code,
      },
    });

    logger.info("payment.notification_dispatch_succeeded", {
      paymentId: payment.id,
      reason,
      messageId: notification.messageId,
    });

    return updatedPayment ?? payment;
  } catch (error) {
    const updatedPayment = await updatePaymentNotificationStatus(payment.id, "failed");

    logger.warn("payment.notification_dispatch_failed", {
      paymentId: payment.id,
      reason,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return updatedPayment ?? payment;
  } finally {
    inFlightNotificationRetries.delete(payment.id);
  }
}

export async function retryPaymentNotificationIfNeeded(payment: PaymentRecord) {
  const manualInviteState = await resolveManualInviteState(payment);
  if (manualInviteState.manualInviteRequired) {
    return manualInviteState.payment;
  }

  if (!canRetryPaymentNotification(payment)) {
    return payment;
  }

  return dispatchPaymentNotification(payment, "retry");
}

export async function sendInitialPaymentNotification(payment: PaymentRecord) {
  return dispatchPaymentNotification(payment, "initial");
}

export async function retryOutstandingNotifications(payments: PaymentRecord[]) {
  const retriablePayments = payments.filter(canRetryPaymentNotification);

  if (retriablePayments.length === 0) {
    return payments;
  }

  const refreshedPayments = new Map<string, PaymentRecord>();

  await Promise.all(
    retriablePayments.map(async (payment) => {
      const updated = await retryPaymentNotificationIfNeeded(payment);
      refreshedPayments.set(payment.id, updated);
    }),
  );

  return payments.map((payment) => refreshedPayments.get(payment.id) ?? payment);
}
