import type { PaymentNotificationStatus, PaymentRecord, PaymentStatus } from "@/app/types/payment";
import { sql } from "@/app/db/client";

import { ensurePaymentTraceColumns } from "./payment-trace";

export async function createPaymentRecord(params: {
  id?: string;
  senderUserId: string;
  senderWallet: string;
  senderDisplayNameSnapshot: string;
  senderHandleSnapshot: string;
  referenceCode: string;
  receiverPhone: string;
  receiverPhoneHash: string;
  tokenSymbol: string;
  tokenMintAddress: string;
  amount: number;
  senderFeeAmount?: number | null;
  claimFeeAmount?: number | null;
  escrowAccount: string;
  escrowVaultAddress: string;
  depositSignature?: string | null;
  expiryAt?: string | null;
}): Promise<PaymentRecord> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    INSERT INTO payments (
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, expiry_at, status, notification_status
    )
    VALUES (
      COALESCE(${params.id ?? null}, gen_random_uuid()), ${params.senderUserId}, ${params.senderWallet},
      ${params.senderDisplayNameSnapshot}, ${params.senderHandleSnapshot}, ${params.referenceCode}, ${params.receiverPhone},
      ${params.receiverPhoneHash}, ${params.tokenSymbol}, ${params.tokenMintAddress}, ${params.amount},
      ${params.senderFeeAmount ?? null}, ${params.claimFeeAmount ?? null}, ${params.escrowAccount},
      ${params.escrowVaultAddress}, ${params.depositSignature ?? null}, ${params.expiryAt ?? null}, 'pending', 'queued'
    )
    RETURNING
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
  `) as PaymentRecord[];

  return rows[0];
}

export async function updatePaymentStatus(id: string, status: PaymentStatus): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    UPDATE payments
    SET status = ${status}
    WHERE id = ${id}
    RETURNING
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function updatePaymentAcceptance(params: {
  id: string;
  releaseSignature?: string | null;
  releasedToWallet: string;
  claimFeeAmount?: number | null;
}): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    UPDATE payments
    SET
      status = 'accepted',
      accepted_at = COALESCE(accepted_at, NOW()),
      claim_fee_amount = COALESCE(${params.claimFeeAmount ?? null}, claim_fee_amount),
      release_signature = COALESCE(${params.releaseSignature ?? null}, release_signature),
      released_to_wallet = ${params.releasedToWallet}
    WHERE id = ${params.id}
    RETURNING
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function updatePaymentExpiredToPool(params: {
  id: string;
  expirySignature?: string | null;
  recoveryWalletAddress: string;
  occurredAt?: string | null;
}): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();
  const occurredAt = params.occurredAt ? new Date(params.occurredAt) : new Date();

  const rows = (await sql`
    UPDATE payments
    SET
      status = 'expired',
      expiry_signature = COALESCE(${params.expirySignature ?? null}, expiry_signature),
      recovery_wallet_address = ${params.recoveryWalletAddress},
      expired_to_pool_at = COALESCE(expired_to_pool_at, ${occurredAt}),
      expiry_at = COALESCE(expiry_at, ${occurredAt})
    WHERE id = ${params.id}
    RETURNING
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function updatePaymentNotificationMessageId(
  id: string,
  notificationMessageId: string,
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
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function updatePaymentNotificationStatus(
  id: string,
  status: PaymentNotificationStatus,
  occurredAt?: string | null,
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
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
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
      id, sender_user_id, sender_wallet, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature,
      expiry_signature, released_to_wallet, accepted_at, expiry_at, expired_to_pool_at, recovery_wallet_address,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}
