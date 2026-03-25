import { sql } from "@/app/db/client";
import type { WhatsAppWebhookEventRecord } from "@/app/types/payment";

export async function createWhatsAppWebhookEvent(params: {
  eventType: string;
  messageId?: string | null;
  relatedPaymentId?: string | null;
  phoneNumber?: string | null;
  direction?: string | null;
  status?: string | null;
  payload: unknown;
}): Promise<WhatsAppWebhookEventRecord> {
  const rows = (await sql`
    INSERT INTO whatsapp_webhook_events (
      event_type,
      message_id,
      related_payment_id,
      phone_number,
      direction,
      status,
      payload
    )
    VALUES (
      ${params.eventType},
      ${params.messageId ?? null},
      ${params.relatedPaymentId ?? null},
      ${params.phoneNumber ?? null},
      ${params.direction ?? null},
      ${params.status ?? null},
      CAST(${JSON.stringify(params.payload)} AS jsonb)
    )
    RETURNING
      id,
      event_type,
      message_id,
      related_payment_id,
      phone_number,
      direction,
      status,
      payload,
      created_at
  `) as WhatsAppWebhookEventRecord[];

  return rows[0];
}

export async function listWhatsAppWebhookEventsByPaymentId(
  paymentId: string
): Promise<WhatsAppWebhookEventRecord[]> {
  const rows = (await sql`
    SELECT
      id,
      event_type,
      message_id,
      related_payment_id,
      phone_number,
      direction,
      status,
      payload,
      created_at
    FROM whatsapp_webhook_events
    WHERE related_payment_id = ${paymentId}
    ORDER BY created_at ASC
  `) as WhatsAppWebhookEventRecord[];

  return rows;
}

export async function findLatestWhatsAppProfileNameByPhoneNumber(
  phoneNumber: string
): Promise<string | null> {
  const normalizedPhoneNumber = phoneNumber.replace(/^\+/, "");

  const rows = (await sql`
    SELECT payload #>> '{contacts,0,profile,name}' AS profile_name
    FROM whatsapp_webhook_events
    WHERE phone_number = ${normalizedPhoneNumber}
      AND payload #>> '{contacts,0,profile,name}' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `) as Array<{ profile_name: string | null }>;

  return rows[0]?.profile_name ?? null;
}
