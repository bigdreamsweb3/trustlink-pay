import { createHmac, timingSafeEqual } from "node:crypto";

import { findPaymentByNotificationMessageId, updatePaymentNotificationStatus } from "@/app/db/payments";
import { createWhatsAppWebhookEvent } from "@/app/db/whatsapp-webhook-events";
import type { PaymentNotificationStatus } from "@/app/types/payment";
import { env } from "@/app/lib/env";
import { logger } from "@/app/lib/logger";

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

export async function processWhatsAppWebhookPayload(payload: WhatsAppWebhookPayload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        continue;
      }

      const value = change.value;

      for (const message of value?.messages ?? []) {
        await createWhatsAppWebhookEvent({
          eventType: "inbound_message",
          messageId: message.id ?? null,
          phoneNumber: message.from ?? null,
          direction: "inbound",
          payload: {
            metadata: value?.metadata,
            message,
            contacts: value?.contacts
          }
        });

        logger.info("whatsapp.webhook.inbound_message", {
          messageId: message.id,
          from: message.from,
          type: message.type,
          text: message.text?.body ?? message.button?.text ?? null
        });
      }

      for (const status of value?.statuses ?? []) {
        const relatedPayment = status.id ? await findPaymentByNotificationMessageId(status.id) : null;
        const normalizedStatus = normalizeNotificationStatus(status.status);
        const occurredAt = parseWhatsAppTimestamp(status.timestamp);

        await createWhatsAppWebhookEvent({
          eventType: "message_status",
          messageId: status.id ?? null,
          relatedPaymentId: relatedPayment?.id ?? null,
          phoneNumber: status.recipient_id ?? null,
          direction: "outbound",
          status: status.status ?? null,
          payload: {
            metadata: value?.metadata,
            status
          }
        });

        if (relatedPayment && normalizedStatus) {
          await updatePaymentNotificationStatus(relatedPayment.id, normalizedStatus, occurredAt);
        }

        logger.info("whatsapp.webhook.message_status", {
          messageId: status.id,
          status: status.status,
          recipientId: status.recipient_id,
          relatedPaymentId: relatedPayment?.id ?? null,
          normalizedStatus,
          occurredAt
        });
      }
    }
  }
}
