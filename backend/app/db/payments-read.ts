import type { PaymentRecord } from "@/app/types/payment";
import { sql } from "@/app/db/client";

import { ensurePaymentTraceColumns } from "./payment-trace";

export async function findPaymentById(id: string): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    SELECT
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
    FROM payments
    WHERE id = ${id}
    LIMIT 1
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function findPaymentByNotificationMessageId(messageId: string): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    SELECT
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
    FROM payments
    WHERE notification_message_id = ${messageId}
    LIMIT 1
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function findPaymentByNotificationMessageEventId(messageId: string): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    SELECT
      p.id, p.sender_user_id, p.sender_wallet, p.sender_display_name_snapshot, p.sender_handle_snapshot,
      p.reference_code, p.receiver_phone, p.receiver_phone_hash, p.token_symbol, p.token_mint_address, p.amount,
      p.sender_fee_amount, p.claim_fee_amount, p.escrow_account, p.escrow_vault_address, p.deposit_signature,
      p.release_signature, p.expiry_signature, p.released_to_wallet, p.accepted_at, p.expiry_at,
      p.expired_to_pool_at, p.recovery_wallet_address, p.notification_message_id, p.notification_status,
      p.notification_sent_at, p.notification_delivered_at, p.notification_read_at, p.notification_failed_at,
      p.notification_attempt_count, p.notification_last_attempt_at, p.status, p.created_at
    FROM payments p
    INNER JOIN whatsapp_webhook_events e
      ON e.related_payment_id = p.id
    WHERE e.message_id = ${messageId}
      AND e.related_payment_id IS NOT NULL
    ORDER BY e.created_at DESC
    LIMIT 1
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function listPendingPaymentsByPhoneNumber(phoneNumber: string): Promise<PaymentRecord[]> {
  await ensurePaymentTraceColumns();

  return (await sql`
    SELECT
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
    FROM payments
    WHERE receiver_phone = ${phoneNumber}
      AND status = 'pending'
    ORDER BY created_at DESC
  `) as PaymentRecord[];
}

export async function listExpiredPendingPayments(limit = 100): Promise<PaymentRecord[]> {
  await ensurePaymentTraceColumns();

  return (await sql`
    SELECT
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
    FROM payments
    WHERE status = 'pending'
      AND expiry_at IS NOT NULL
      AND expiry_at <= NOW()
    ORDER BY expiry_at ASC
    LIMIT ${limit}
  `) as PaymentRecord[];
}

export async function listPaymentHistory(params: {
  userId: string;
  phoneNumber: string;
  limit?: number;
}): Promise<PaymentRecord[]> {
  await ensurePaymentTraceColumns();

  return (await sql`
    SELECT
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
    FROM payments
    WHERE sender_user_id = ${params.userId}
       OR receiver_phone = ${params.phoneNumber}
    ORDER BY created_at DESC
    LIMIT ${params.limit ?? 20}
  `) as PaymentRecord[];
}

export async function findLatestReferralCandidateByReceiverPhone(
  phoneNumber: string,
): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    SELECT
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
    FROM payments
    WHERE receiver_phone = ${phoneNumber}
      AND sender_user_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function findPaymentByDepositSignature(depositSignature: string): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    SELECT
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
    FROM payments
    WHERE deposit_signature = ${depositSignature}
    LIMIT 1
  `) as PaymentRecord[];

  return rows[0] ?? null;
}
