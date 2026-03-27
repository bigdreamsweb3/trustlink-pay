export type PaymentStatus = "pending" | "accepted" | "cancelled" | "expired";
export type PaymentNotificationStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type PaymentViewerRole = "sender" | "receiver";

export interface UserRecord {
  id: string;
  phone_number: string;
  phone_hash: string;
  display_name: string;
  trustlink_handle: string;
  pin_hash: string;
  wallet_address: string | null;
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
  sender_display_name_snapshot: string;
  sender_handle_snapshot: string;
  reference_code: string;
  receiver_phone: string;
  receiver_phone_hash: string;
  token_symbol: string;
  token_mint_address: string | null;
  amount: string;
  fee_amount: string | null;
  escrow_account: string | null;
  escrow_vault_address: string | null;
  deposit_signature: string | null;
  release_signature: string | null;
  released_to_wallet: string | null;
  accepted_at: string | null;
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
  recipient_onboarded?: boolean;
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

