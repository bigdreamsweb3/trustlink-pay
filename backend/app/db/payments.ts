import type { PaymentNotificationStatus, PaymentRecord, PaymentStatus } from "@/app/types/payment";
import { sql } from "@/app/db/client";

let paymentTraceColumnsReady: Promise<void> | null = null;

async function ensurePaymentTraceColumns() {
  if (!paymentTraceColumnsReady) {
    paymentTraceColumnsReady = (async () => {
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS deposit_signature VARCHAR(128)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS release_signature VARCHAR(128)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS released_to_wallet VARCHAR(64)`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notification_attempt_count INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notification_last_attempt_at TIMESTAMPTZ`;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_deposit_signature
        ON payments (deposit_signature)
        WHERE deposit_signature IS NOT NULL
      `;
      await sql`
        UPDATE payments
        SET accepted_at = COALESCE(accepted_at, created_at)
        WHERE status = 'accepted'
          AND accepted_at IS NULL
      `;
      await sql`
        UPDATE payments
        SET notification_attempt_count = 1,
            notification_last_attempt_at = COALESCE(notification_last_attempt_at, notification_sent_at, created_at)
        WHERE notification_message_id IS NOT NULL
          AND notification_attempt_count = 0
      `;
    })().catch((error) => {
      paymentTraceColumnsReady = null;
      throw error;
    });
  }

  await paymentTraceColumnsReady;
}

export async function createPaymentRecord(params: {
  senderUserId: string;
  senderWallet: string;
  senderDisplayNameSnapshot: string;
  senderHandleSnapshot: string;
  referenceCode: string;
  receiverPhone: string;
  receiverPhoneHash: string;
  tokenSymbol: string;
  amount: number;
  escrowAccount: string;
  depositSignature?: string | null;
}): Promise<PaymentRecord> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    INSERT INTO payments (
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      status,
      notification_status
    )
    VALUES (
      ${params.senderUserId},
      ${params.senderWallet},
      ${params.senderDisplayNameSnapshot},
      ${params.senderHandleSnapshot},
      ${params.referenceCode},
      ${params.receiverPhone},
      ${params.receiverPhoneHash},
      ${params.tokenSymbol},
      ${params.amount},
      ${params.escrowAccount},
      ${params.depositSignature ?? null},
      'pending',
      'queued'
    )
    RETURNING
      id,
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      release_signature,
      released_to_wallet,
      accepted_at,
      notification_message_id,
      notification_status,
      notification_sent_at,
      notification_delivered_at,
      notification_read_at,
      notification_failed_at,
      notification_attempt_count,
      notification_last_attempt_at,
      status,
      created_at
  `) as PaymentRecord[];

  return rows[0];
}

export async function findPaymentById(id: string): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    SELECT
      id,
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      release_signature,
      released_to_wallet,
      accepted_at,
      notification_message_id,
      notification_status,
      notification_sent_at,
      notification_delivered_at,
      notification_read_at,
      notification_failed_at,
      notification_attempt_count,
      notification_last_attempt_at,
      status,
      created_at
    FROM payments
    WHERE id = ${id}
    LIMIT 1
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function updatePaymentStatus(id: string, status: PaymentStatus): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    UPDATE payments
    SET status = ${status}
    WHERE id = ${id}
    RETURNING
      id,
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      release_signature,
      released_to_wallet,
      accepted_at,
      notification_message_id,
      notification_status,
      notification_sent_at,
      notification_delivered_at,
      notification_read_at,
      notification_failed_at,
      notification_attempt_count,
      notification_last_attempt_at,
      status,
      created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function updatePaymentAcceptance(params: {
  id: string;
  releaseSignature?: string | null;
  releasedToWallet: string;
}): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    UPDATE payments
    SET
      status = 'accepted',
      accepted_at = COALESCE(accepted_at, NOW()),
      release_signature = COALESCE(${params.releaseSignature ?? null}, release_signature),
      released_to_wallet = ${params.releasedToWallet}
    WHERE id = ${params.id}
    RETURNING
      id,
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      release_signature,
      released_to_wallet,
      accepted_at,
      notification_message_id,
      notification_status,
      notification_sent_at,
      notification_delivered_at,
      notification_read_at,
      notification_failed_at,
      notification_attempt_count,
      notification_last_attempt_at,
      status,
      created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function updatePaymentNotificationMessageId(
  id: string,
  notificationMessageId: string
): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    UPDATE payments
    SET notification_message_id = ${notificationMessageId},
        notification_status = CASE
          WHEN notification_status = 'read' THEN notification_status
          WHEN notification_status = 'delivered' THEN notification_status
          ELSE 'sent'
        END,
        notification_sent_at = COALESCE(notification_sent_at, NOW()),
        notification_attempt_count = GREATEST(notification_attempt_count, 1),
        notification_last_attempt_at = COALESCE(notification_last_attempt_at, NOW())
    WHERE id = ${id}
    RETURNING
      id,
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      release_signature,
      released_to_wallet,
      accepted_at,
      notification_message_id,
      notification_status,
      notification_sent_at,
      notification_delivered_at,
      notification_read_at,
      notification_failed_at,
      notification_attempt_count,
      notification_last_attempt_at,
      status,
      created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function updatePaymentNotificationStatus(
  id: string,
  status: PaymentNotificationStatus,
  occurredAt?: string | null
): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const timestamp = occurredAt ? new Date(occurredAt) : new Date();

  const rows = (await sql`
    UPDATE payments
    SET notification_status = CASE
          WHEN ${status} = 'read' THEN 'read'
          WHEN ${status} = 'delivered' AND notification_status <> 'read' THEN 'delivered'
          WHEN ${status} = 'sent' AND notification_status NOT IN ('read', 'delivered') THEN 'sent'
          WHEN ${status} = 'failed' AND notification_status NOT IN ('read', 'delivered') THEN 'failed'
          ELSE notification_status
        END,
        notification_sent_at = CASE
          WHEN ${status} IN ('sent', 'delivered', 'read') THEN COALESCE(notification_sent_at, ${timestamp})
          ELSE notification_sent_at
        END,
        notification_delivered_at = CASE
          WHEN ${status} IN ('delivered', 'read') THEN COALESCE(notification_delivered_at, ${timestamp})
          ELSE notification_delivered_at
        END,
      notification_read_at = CASE
          WHEN ${status} = 'read' THEN COALESCE(notification_read_at, ${timestamp})
          ELSE notification_read_at
        END,
        notification_failed_at = CASE
          WHEN ${status} = 'failed' AND notification_status NOT IN ('read', 'delivered') THEN COALESCE(notification_failed_at, ${timestamp})
          ELSE notification_failed_at
        END,
        notification_last_attempt_at = CASE
          WHEN ${status} IN ('sent', 'failed') THEN COALESCE(notification_last_attempt_at, ${timestamp})
          ELSE notification_last_attempt_at
        END
    WHERE id = ${id}
    RETURNING
      id,
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      release_signature,
      released_to_wallet,
      accepted_at,
      notification_message_id,
      notification_status,
      notification_sent_at,
      notification_delivered_at,
      notification_read_at,
      notification_failed_at,
      notification_attempt_count,
      notification_last_attempt_at,
      status,
      created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function findPaymentByNotificationMessageId(messageId: string): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    SELECT
      id,
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      release_signature,
      released_to_wallet,
      accepted_at,
      notification_message_id,
      notification_status,
      notification_sent_at,
      notification_delivered_at,
      notification_read_at,
      notification_failed_at,
      notification_attempt_count,
      notification_last_attempt_at,
      status,
      created_at
    FROM payments
    WHERE notification_message_id = ${messageId}
    LIMIT 1
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function listPendingPaymentsByPhoneNumber(phoneNumber: string): Promise<PaymentRecord[]> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    SELECT
      id,
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      release_signature,
      released_to_wallet,
      accepted_at,
      notification_message_id,
      notification_status,
      notification_sent_at,
      notification_delivered_at,
      notification_read_at,
      notification_failed_at,
      notification_attempt_count,
      notification_last_attempt_at,
      status,
      created_at
    FROM payments
    WHERE receiver_phone = ${phoneNumber}
      AND status = 'pending'
    ORDER BY created_at DESC
  `) as PaymentRecord[];

  return rows;
}

export async function listPaymentHistory(params: {
  userId: string;
  phoneNumber: string;
  limit?: number;
}): Promise<PaymentRecord[]> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    SELECT
      id,
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      release_signature,
      released_to_wallet,
      accepted_at,
      notification_message_id,
      notification_status,
      notification_sent_at,
      notification_delivered_at,
      notification_read_at,
      notification_failed_at,
      notification_attempt_count,
      notification_last_attempt_at,
      status,
      created_at
    FROM payments
    WHERE sender_user_id = ${params.userId}
       OR receiver_phone = ${params.phoneNumber}
    ORDER BY created_at DESC
    LIMIT ${params.limit ?? 20}
  `) as PaymentRecord[];

  return rows;
}

export async function findPaymentByDepositSignature(depositSignature: string): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    SELECT
      id,
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      release_signature,
      released_to_wallet,
      accepted_at,
      notification_message_id,
      notification_status,
      notification_sent_at,
      notification_delivered_at,
      notification_read_at,
      notification_failed_at,
      notification_attempt_count,
      notification_last_attempt_at,
      status,
      created_at
    FROM payments
    WHERE deposit_signature = ${depositSignature}
    LIMIT 1
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function markPaymentNotificationAttempt(id: string): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    UPDATE payments
    SET
      notification_attempt_count = notification_attempt_count + 1,
      notification_last_attempt_at = NOW(),
      notification_status = CASE
        WHEN notification_status IN ('read', 'delivered') THEN notification_status
        ELSE 'queued'
      END
    WHERE id = ${id}
    RETURNING
      id,
      sender_user_id,
      sender_wallet,
      sender_display_name_snapshot,
      sender_handle_snapshot,
      reference_code,
      receiver_phone,
      receiver_phone_hash,
      token_symbol,
      amount,
      escrow_account,
      deposit_signature,
      release_signature,
      released_to_wallet,
      accepted_at,
      notification_message_id,
      notification_status,
      notification_sent_at,
      notification_delivered_at,
      notification_read_at,
      notification_failed_at,
      notification_attempt_count,
      notification_last_attempt_at,
      status,
      created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}
