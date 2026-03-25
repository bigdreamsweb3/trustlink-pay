import type { PaymentRecord, PaymentStatus } from "@/app/types/payment";
import { sql } from "@/app/db/client";

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
}): Promise<PaymentRecord> {
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
      status
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
      'pending'
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
      notification_message_id,
      status,
      created_at
  `) as PaymentRecord[];

  return rows[0];
}

export async function findPaymentById(id: string): Promise<PaymentRecord | null> {
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
      notification_message_id,
      status,
      created_at
    FROM payments
    WHERE id = ${id}
    LIMIT 1
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function updatePaymentStatus(id: string, status: PaymentStatus): Promise<PaymentRecord | null> {
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
      notification_message_id,
      status,
      created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function updatePaymentNotificationMessageId(
  id: string,
  notificationMessageId: string
): Promise<PaymentRecord | null> {
  const rows = (await sql`
    UPDATE payments
    SET notification_message_id = ${notificationMessageId}
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
      notification_message_id,
      status,
      created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function findPaymentByNotificationMessageId(messageId: string): Promise<PaymentRecord | null> {
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
      notification_message_id,
      status,
      created_at
    FROM payments
    WHERE notification_message_id = ${messageId}
    LIMIT 1
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function listPendingPaymentsByPhoneNumber(phoneNumber: string): Promise<PaymentRecord[]> {
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
      notification_message_id,
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
      notification_message_id,
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
