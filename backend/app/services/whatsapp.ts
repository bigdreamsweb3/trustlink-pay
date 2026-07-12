import {
  findPaymentByNotificationMessageEventId,
  findPaymentByNotificationMessageId,
  updatePaymentNotificationMessageId,
  updatePaymentNotificationStatus,
} from "@/app/db/payments";
import { createWhatsAppWebhookEvent } from "@/app/db/whatsapp-webhook-events";
import {
  findUserByPhoneNumber,
  markUserWhatsAppOptIn,
  markUserWhatsAppOptOut,
  upsertUserProfile,
} from "@/app/db/users";
import { issueAuthChallengeToken } from "@/app/lib/auth";
import {
  findPendingSessionForPhone,
  findSessionCode,
  markSessionAwaitingConfirmation,
  markSessionDeclined,
  verifySessionCode,
} from "@/app/lib/session-codes";
import { notifySessionVerification } from "@/app/lib/session-events";
import { sanitizeUser } from "@/app/services/auth/shared";
import { sendPhoneVerificationOtp } from "@/app/services/phone-verification";
import { configureWhatsAppSdkPorts } from "../../../packages/trustlink-whatsapp-sdk/backend";

let configured = false;

export function configureTrustLinkWhatsAppSdk() {
  if (configured) return;

  configureWhatsAppSdkPorts({
    users: {
      findByPhoneNumber: findUserByPhoneNumber,
      upsertProfile: upsertUserProfile,
      markOptIn: markUserWhatsAppOptIn,
      markOptOut: markUserWhatsAppOptOut,
    },
    payments: {
      findByNotificationMessageId: findPaymentByNotificationMessageId,
      findByNotificationMessageEventId: findPaymentByNotificationMessageEventId,
      updateNotificationMessageId: updatePaymentNotificationMessageId,
      updateNotificationStatus: updatePaymentNotificationStatus,
    },
    webhookEvents: {
      create: createWhatsAppWebhookEvent,
    },
    sessions: {
      findSessionCode,
      findPendingSessionForPhone,
      markSessionAwaitingConfirmation,
      markSessionDeclined,
      verifySessionCode,
    },
    auth: {
      issueChallengeToken: issueAuthChallengeToken,
      sanitizeUser,
      notifySessionVerification,
    },
    phoneVerification: {
      sendOtp: (phoneNumber, purpose) =>
        sendPhoneVerificationOtp(
          phoneNumber,
          purpose === "auth" ? "auth" : "generic",
        ),
    },
  });

  configured = true;
}

configureTrustLinkWhatsAppSdk();

export * from "../../../packages/trustlink-whatsapp-sdk/backend";
