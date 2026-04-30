import type { PaymentRecord } from "@/app/types/payment";
import { sql } from "@/app/db/client";

import { ensurePaymentTraceColumns } from "./payment-trace";

export async function findPaymentById(id: string): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();
  const rows = (await sql`
    SELECT
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey,
      refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount, claim_fee_amount,
      escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at, notification_read_at,
      notification_failed_at, notification_attempt_count, notification_last_attempt_at, status, created_at
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
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey,
      refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount, claim_fee_amount,
      escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at, notification_read_at,
      notification_failed_at, notification_attempt_count, notification_last_attempt_at, status, created_at
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
      p.id, p.sender_user_id, p.sender_wallet, p.sender_phone_identity_pubkey, p.sender_display_name_snapshot, p.sender_handle_snapshot,
      p.reference_code, p.receiver_phone, p.receiver_phone_hash, p.payment_mode, p.sender_autoclaim_enabled, p.receiver_autoclaim_allowed, p.receiver_wallet, p.receiver_onboarded,
      p.phone_identity_pubkey, p.payment_receiver_pubkey, p.ephemeral_pubkey,
      p.refund_receiver_pubkey, p.refund_ephemeral_pubkey, p.token_symbol, p.token_mint_address, p.amount,
      p.sender_fee_amount, p.claim_fee_amount, p.escrow_account, p.escrow_vault_address, p.deposit_signature,
      p.release_signature, p.refund_release_signature, p.released_to_wallet, p.refund_released_to_wallet, p.refund_requested_at, p.refund_available_at, p.refund_claimed_at, p.expiry_at,
      p.notification_message_id, p.notification_status,
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

export async function listLockedPaymentsByPhoneNumber(phoneNumber: string): Promise<PaymentRecord[]> {
  await ensurePaymentTraceColumns();

  return (await sql`
    SELECT
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey,
      refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount, claim_fee_amount,
      escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at, notification_read_at,
      notification_failed_at, notification_attempt_count, notification_last_attempt_at, status, created_at
    FROM payments
    WHERE receiver_phone = ${phoneNumber}
      AND status IN ('locked', 'expired')
    ORDER BY created_at DESC
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
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey,
      refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount, claim_fee_amount,
      escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at, notification_read_at,
      notification_failed_at, notification_attempt_count, notification_last_attempt_at, status, created_at
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
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey,
      refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount, claim_fee_amount,
      escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at, notification_read_at,
      notification_failed_at, notification_attempt_count, notification_last_attempt_at, status, created_at
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
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey,
      refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount, claim_fee_amount,
      escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at, notification_read_at,
      notification_failed_at, notification_attempt_count, notification_last_attempt_at, status, created_at
    FROM payments
    WHERE deposit_signature = ${depositSignature}
    LIMIT 1
  `) as PaymentRecord[];

  return rows[0] ?? null;
}
