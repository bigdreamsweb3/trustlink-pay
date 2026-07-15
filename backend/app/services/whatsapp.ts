import {
  findPaymentByNotificationMessageEventId,
  findPaymentByNotificationMessageId,
  updatePaymentNotificationMessageId,
  updatePaymentNotificationStatus,
} from "@/app/db/payments";
import { createWhatsAppWebhookEvent } from "@/app/db/whatsapp-webhook-events";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
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
import {
  configureWhatsAppSdkConfig,
  configureWhatsAppSdkLogger,
  configureWhatsAppSdkPorts,
} from "../../../packages/trustlink-whatsapp-sdk/backend";

let configured = false;

function requireWhatsAppConfiguration(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required WhatsApp configuration: ${name}`);
  }

  return value;
}

export function configureTrustLinkWhatsAppSdk() {
  if (configured) return;

  configureWhatsAppSdkConfig({
    AUTH_SESSION_CODE_TTL_MINUTES: env.AUTH_SESSION_CODE_TTL_MINUTES,
    WHATSAPP_MOCK_MODE: env.WHATSAPP_MOCK_MODE,
    WHATSAPP_BASE_URL: env.WHATSAPP_BASE_URL,
    WHATSAPP_API_VERSION: env.WHATSAPP_API_VERSION,
    WHATSAPP_PHONE_ID: requireWhatsAppConfiguration(
      "WHATSAPP_PHONE_ID",
      env.WHATSAPP_PHONE_ID,
    ),
    WHATSAPP_API_KEY: requireWhatsAppConfiguration(
      "WHATSAPP_API_KEY",
      env.WHATSAPP_API_KEY,
    ),
    WHATSAPP_APP_SECRET: env.WHATSAPP_APP_SECRET,
    TRUSTLINK_BUSINESS_NUMBER: env.TRUSTLINK_BUSINESS_NUMBER,
    TRUSTLINK_CLAIM_BASE_URL: env.TRUSTLINK_CLAIM_BASE_URL,
    WHATSAPP_USE_TEMPLATES: env.WHATSAPP_USE_TEMPLATES,
    WHATSAPP_TEMPLATE_LANGUAGE_CODE: env.WHATSAPP_TEMPLATE_LANGUAGE_CODE,
    WHATSAPP_PAYMENT_TEMPLATE_NAME: env.WHATSAPP_PAYMENT_TEMPLATE_NAME,
    WHATSAPP_OTP_TEMPLATE_NAME: env.WHATSAPP_OTP_TEMPLATE_NAME,
    WHATSAPP_SESSION_REVIEW_TEMPLATE_NAME:
      env.WHATSAPP_SESSION_REVIEW_TEMPLATE_NAME,
  });

  configureWhatsAppSdkLogger(logger);

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
