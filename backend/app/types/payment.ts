export type PaymentStatus = "created" | "locked" | "expired" | "claimed" | "refund_requested" | "refunded";
export type PaymentNotificationStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type PaymentViewerRole = "sender" | "receiver";
export type PaymentMode = "secure" | "invite";

export interface UserRecord {
  id: string;
  phone_number: string;
  phone_hash: string;
  phone_identity_pubkey?: string | null;
  privacy_view_pubkey?: string | null;
  privacy_spend_pubkey?: string | null;
  settlement_wallet_pubkey?: string | null;
  recovery_wallet_pubkey?: string | null;
  binding_signature?: string | null;
  display_name: string;
  trustlink_handle: string;
  pin_hash: string;
  wallet_address: string | null;
  receiver_autoclaim_enabled?: boolean;
  whatsapp_opted_in: boolean;
  opt_in_timestamp: string | null;
  opt_out_timestamp: string | null;
  phone_verified_at: string | null;
  identity_verified_at: string | null;
  referred_by_user_id: string | null;
  referral_source_payment_id: string | null;
  referred_at: string | null;
  created_at: string;
}

export interface PaymentRecord {
  id: string;
  sender_user_id: string | null;
  sender_wallet: string | null;
  sender_phone_identity_pubkey?: string | null;
  sender_display_name_snapshot: string;
  sender_handle_snapshot: string;
  reference_code: string;
  receiver_phone: string;
  receiver_phone_hash: string;
  payment_mode?: PaymentMode;
  sender_autoclaim_enabled?: boolean;
  receiver_autoclaim_allowed?: boolean;
  receiver_wallet?: string | null;
  receiver_onboarded?: boolean;
  phone_identity_pubkey?: string | null;
  payment_receiver_pubkey?: string | null;
  ephemeral_pubkey?: string | null;
  refund_receiver_pubkey?: string | null;
  refund_ephemeral_pubkey?: string | null;
  token_symbol: string;
  token_mint_address: string | null;
  amount: string;
  sender_fee_amount: string | null;
  claim_fee_amount: string | null;
  escrow_account: string | null;
  escrow_vault_address: string | null;
  deposit_signature: string | null;
  release_signature: string | null;
  refund_release_signature?: string | null;
  released_to_wallet: string | null;
  refund_released_to_wallet?: string | null;
  refund_requested_at?: string | null;
  refund_available_at?: string | null;
  refund_claimed_at?: string | null;
  expiry_at?: string | null;
  notification_message_id: string | null;
  notification_status: PaymentNotificationStatus;
  notification_sent_at: string | null;
  notification_delivered_at: string | null;
  notification_read_at: string | null;
  notification_failed_at: string | null;
  notification_attempt_count: number;
  notification_last_attempt_at: string | null;
  status: PaymentStatus;
  created_at: string;
  viewer_role?: PaymentViewerRole;
  manual_invite_required?: boolean;
  invite_share?: {
    onboardingLink: string;
    inviteMessage: string;
  } | null;
}

export interface PhoneVerificationRecord {
  id: string;
  phone_number: string;
  otp_code: string;
  purpose: string;
  attempt_count: number;
  consumed_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface ReceiverWalletRecord {
  id: string;
  user_id: string;
  wallet_name: string;
  wallet_address: string;
  created_at: string;
}

export interface WhatsAppWebhookEventRecord {
  id: string;
  event_type: string;
  message_id: string | null;
  related_payment_id: string | null;
  phone_number: string | null;
  direction: string | null;
  status: string | null;
  payload: unknown;
  created_at: string;
}

