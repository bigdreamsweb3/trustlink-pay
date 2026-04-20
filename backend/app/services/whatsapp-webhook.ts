import { createHmac, timingSafeEqual } from "node:crypto";

import {
  findPaymentByNotificationMessageEventId,
  findPaymentByNotificationMessageId,
  updatePaymentNotificationMessageId,
  updatePaymentNotificationStatus
} from "@/app/db/payments";
import { markUserWhatsAppOptIn, markUserWhatsAppOptOut } from "@/app/db/users";
import { createWhatsAppWebhookEvent } from "@/app/db/whatsapp-webhook-events";
import type { PaymentNotificationStatus } from "@/app/types/payment";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";
import { sendPhoneVerificationOtp } from "@/app/services/phone-verification";
import { isTrustLinkOptInMessage, isTrustLinkStopMessage } from "@/app/services/whatsapp";
import { normalizePhoneNumber } from "@/app/utils/phone";
import { sha256 } from "@/app/utils/hash";

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{
          wa_id?: string;
          profile?: {
            name?: string;
          };
        }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: {
            body?: string;
          };
          button?: {
            text?: string;
          };
          interactive?: unknown;
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          conversation?: unknown;
          pricing?: unknown;
          errors?: unknown;
        }>;
      };
    }>;
  }>;
}

type WhatsAppEntry = NonNullable<WhatsAppWebhookPayload["entry"]>[number];
type WhatsAppChange = NonNullable<WhatsAppEntry["changes"]>[number];
type WhatsAppValue = NonNullable<WhatsAppChange["value"]>;
type WhatsAppMessage = NonNullable<WhatsAppValue["messages"]>[number];

function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeNotificationStatus(status: string | undefined): PaymentNotificationStatus | null {
  switch (status) {
    case "sent":
    case "delivered":
    case "read":
    case "failed":
      return status;
    default:
      return null;
  }
}

function parseWhatsAppTimestamp(timestamp: string | undefined): string | null {
  if (!timestamp) {
    return null;
  }

  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp)) {
    return null;
  }

  return new Date(numericTimestamp * 1000).toISOString();
}

function getInboundText(message: WhatsAppMessage) {
  return message.text?.body ?? message.button?.text ?? "";
}

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!env.WHATSAPP_APP_SECRET) {
    return true;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex");
  return secureCompare(signatureHeader, `sha256=${expectedSignature}`);
}

async function processInboundMessage(
  value: WhatsAppValue,
  message: WhatsAppMessage,
) {
  const normalizedPhoneNumber = message.from ? normalizePhoneNumber(message.from) : null;
  const inboundText = getInboundText(message);
  const contactName = value?.contacts?.[0]?.profile?.name;

  logger.info("whatsapp.webhook.inbound_received", {
    rawFrom: message.from ?? null,
    normalizedPhoneNumber,
    contactName: contactName ?? null,
    messageId: message.id ?? null,
    type: message.type ?? null,
    text: inboundText || null,
  });

  await createWhatsAppWebhookEvent({
    eventType: "inbound_message",
    messageId: message.id ?? null,
    phoneNumber: normalizedPhoneNumber,
    direction: "inbound",
    payload: {
      metadata: value?.metadata,
      message,
      contacts: value?.contacts,
    },
  });

  if (!normalizedPhoneNumber) {
    return;
  }

  if (isTrustLinkStopMessage(inboundText)) {
    await markUserWhatsAppOptOut({
      phoneNumber: normalizedPhoneNumber,
      optedOutAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
    });

    logger.info("whatsapp.webhook.opt_out_received", {
      phoneNumber: normalizedPhoneNumber,
    });
    return;
  }

  if (isTrustLinkOptInMessage(inboundText)) {
    await markUserWhatsAppOptIn({
      phoneNumber: normalizedPhoneNumber,
      phoneHash: sha256(normalizedPhoneNumber),
      displayName: contactName,
      optedInAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
    });

    await sendPhoneVerificationOtp(normalizedPhoneNumber, "auth");

    logger.info("whatsapp.webhook.opt_in_received", {
      phoneNumber: normalizedPhoneNumber,
    });
    return;
  }

  logger.info("whatsapp.webhook.inbound_message", {
    messageId: message.id,
    from: normalizedPhoneNumber,
    type: message.type,
    text: inboundText || null,
  });
}

export async function processWhatsAppWebhookPayload(payload: WhatsAppWebhookPayload) {
  logger.info("whatsapp.webhook.payload_received", {
    object: payload.object ?? null,
    entryCount: payload.entry?.length ?? 0,
  });

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        continue;
      }

      const value = change.value;
      if (!value) {
        continue;
      }

      for (const message of value.messages ?? []) {
        await processInboundMessage(value, message);
      }

      for (const status of value.statuses ?? []) {
        let relatedPayment = status.id ? await findPaymentByNotificationMessageId(status.id) : null;

        if (!relatedPayment && status.id) {
          relatedPayment = await findPaymentByNotificationMessageEventId(status.id);

          if (relatedPayment && relatedPayment.notification_message_id !== status.id) {
            relatedPayment =
              (await updatePaymentNotificationMessageId(relatedPayment.id, status.id)) ?? relatedPayment;
          }
        }

        const normalizedStatus = normalizeNotificationStatus(status.status);
        const occurredAt = parseWhatsAppTimestamp(status.timestamp);
        const normalizedPhoneNumber = status.recipient_id
          ? normalizePhoneNumber(status.recipient_id)
          : null;

        await createWhatsAppWebhookEvent({
          eventType: "message_status",
          messageId: status.id ?? null,
          relatedPaymentId: relatedPayment?.id ?? null,
          phoneNumber: normalizedPhoneNumber,
          direction: "outbound",
          status: status.status ?? null,
          payload: {
            metadata: value?.metadata,
            status,
          },
        });

        if (relatedPayment && normalizedStatus) {
          await updatePaymentNotificationStatus(relatedPayment.id, normalizedStatus, occurredAt);
        }

        logger.info("whatsapp.webhook.message_status", {
          messageId: status.id,
          status: status.status,
          recipientId: normalizedPhoneNumber,
          relatedPaymentId: relatedPayment?.id ?? null,
          normalizedStatus,
          occurredAt,
        });
      }
    }
  }
}
