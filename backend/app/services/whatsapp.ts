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
  });

  configured = true;
}

configureTrustLinkWhatsAppSdk();

export * from "../../../packages/trustlink-whatsapp-sdk/backend";
