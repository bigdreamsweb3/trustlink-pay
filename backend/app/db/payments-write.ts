import type { PaymentMode, PaymentNotificationStatus, PaymentRecord, PaymentStatus } from "@/app/types/payment";
import { sql } from "@/app/db/client";

import { ensurePaymentTraceColumns } from "./payment-trace";

export async function createPaymentRecord(params: {
  id?: string;
  senderUserId: string;
  senderWallet: string;
  senderPhoneIdentityPublicKey?: string | null;
  senderDisplayNameSnapshot: string;
  senderHandleSnapshot: string;
  referenceCode: string;
  receiverPhone: string;
  receiverPhoneHash: string;
  paymentMode?: PaymentMode;
  receiverIdentityPublicKey: string;
  paymentReceiverPublicKey?: string | null;
  ephemeralPublicKey?: string | null;
  receiverAutoclaimAllowed?: boolean;
  receiverWallet?: string | null;
  receiverOnboarded?: boolean;
  tokenSymbol: string;
  tokenMintAddress: string;
  amount: number;
  senderFeeAmount?: number | null;
  claimFeeAmount?: number | null;
  escrowAccount: string;
  escrowVaultAddress: string;
  depositSignature?: string | null;
  expiryAt?: string | null;
  senderAutoclaimEnabled?: boolean;
}): Promise<PaymentRecord> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    INSERT INTO payments (
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_wallet, receiver_onboarded,
      receiver_autoclaim_allowed, phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, expiry_at, status, notification_status
    )
    VALUES (
      COALESCE(${params.id ?? null}, gen_random_uuid()), ${params.senderUserId}, ${params.senderWallet},
      ${params.senderPhoneIdentityPublicKey ?? null}, ${params.senderDisplayNameSnapshot}, ${params.senderHandleSnapshot}, ${params.referenceCode}, ${params.receiverPhone},
      ${params.receiverPhoneHash}, ${params.paymentMode ?? "secure"}, ${params.senderAutoclaimEnabled ?? false},
      ${params.receiverWallet ?? null}, ${params.receiverOnboarded ?? false}, ${params.receiverAutoclaimAllowed ?? false}, ${params.receiverIdentityPublicKey},
      ${params.paymentReceiverPublicKey ?? null}, ${params.ephemeralPublicKey ?? null}, ${params.tokenSymbol}, ${params.tokenMintAddress}, ${params.amount},
      ${params.senderFeeAmount ?? null}, ${params.claimFeeAmount ?? null}, ${params.escrowAccount},
      ${params.escrowVaultAddress}, ${params.depositSignature ?? null}, ${params.expiryAt ?? null}, 'locked', 'queued'
    )
    RETURNING
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey, refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
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
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey, refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function markPaymentClaimed(params: {
  id: string;
  releaseSignature?: string | null;
  releasedToWallet: string;
  claimFeeAmount?: number | null;
}): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    UPDATE payments
    SET
      status = 'claimed',
      claim_fee_amount = COALESCE(${params.claimFeeAmount ?? null}, claim_fee_amount),
      release_signature = COALESCE(${params.releaseSignature ?? null}, release_signature),
      released_to_wallet = ${params.releasedToWallet}
    WHERE id = ${params.id}
    RETURNING
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey, refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function markPaymentRefundRequested(params: {
  id: string;
  refundReceiverPublicKey: string;
  refundEphemeralPublicKey: string;
  requestedAt?: Date;
  refundAvailableAt?: Date;
}): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();
  const requestedAt = params.requestedAt ?? new Date();
  const refundAvailableAt = params.refundAvailableAt ?? requestedAt;

  const rows = (await sql`
    UPDATE payments
    SET
      status = 'refund_requested',
      refund_receiver_pubkey = ${params.refundReceiverPublicKey},
      refund_ephemeral_pubkey = ${params.refundEphemeralPublicKey},
      refund_requested_at = COALESCE(refund_requested_at, ${requestedAt}),
      refund_available_at = COALESCE(refund_available_at, ${refundAvailableAt})
    WHERE id = ${params.id}
    RETURNING
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey, refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function markPaymentRefundClaimed(params: {
  id: string;
  refundReleaseSignature?: string | null;
  releasedToWallet: string;
}): Promise<PaymentRecord | null> {
  await ensurePaymentTraceColumns();

  const rows = (await sql`
    UPDATE payments
    SET
      status = 'refunded',
      refund_claimed_at = COALESCE(refund_claimed_at, NOW()),
      refund_release_signature = COALESCE(${params.refundReleaseSignature ?? null}, refund_release_signature),
      refund_released_to_wallet = ${params.releasedToWallet}
    WHERE id = ${params.id}
    RETURNING
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey, refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
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
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey, refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
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
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey, refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
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
      id, sender_user_id, sender_wallet, sender_phone_identity_pubkey, sender_display_name_snapshot, sender_handle_snapshot, reference_code,
      receiver_phone, receiver_phone_hash, payment_mode, sender_autoclaim_enabled, receiver_autoclaim_allowed, receiver_wallet, receiver_onboarded,
      phone_identity_pubkey, payment_receiver_pubkey, ephemeral_pubkey, refund_receiver_pubkey, refund_ephemeral_pubkey, token_symbol, token_mint_address, amount, sender_fee_amount,
      claim_fee_amount, escrow_account, escrow_vault_address, deposit_signature, release_signature, refund_release_signature,
      released_to_wallet, refund_released_to_wallet, refund_requested_at, refund_available_at, refund_claimed_at, expiry_at,
      notification_message_id, notification_status, notification_sent_at, notification_delivered_at,
      notification_read_at, notification_failed_at, notification_attempt_count, notification_last_attempt_at,
      status, created_at
  `) as PaymentRecord[];

  return rows[0] ?? null;
}

export async function markPaymentsReceiverOnboarded(params: {
  receiverPhone: string;
  receiverWallet: string;
}): Promise<number> {
  await ensurePaymentTraceColumns();

  const result = await sql`
    UPDATE payments
    SET
      receiver_onboarded = true,
      receiver_wallet = COALESCE(receiver_wallet, ${params.receiverWallet})
    WHERE receiver_phone = ${params.receiverPhone}
      AND status = 'locked'
  `;

  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

export async function updatePaymentsReceiverAutoclaimAllowed(params: {
  receiverPhone: string;
  enabled: boolean;
}): Promise<number> {
  await ensurePaymentTraceColumns();

  const result = await sql`
    UPDATE payments
    SET receiver_autoclaim_allowed = ${params.enabled}
    WHERE receiver_phone = ${params.receiverPhone}
      AND status = 'locked'
  `;

  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}
