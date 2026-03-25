export type PaymentStatus = "pending" | "accepted" | "cancelled" | "expired";

export interface UserRecord {
  id: string;
  phone_number: string;
  phone_hash: string;
  display_name: string;
  trustlink_handle: string;
  pin_hash: string;
  wallet_address: string | null;
  phone_verified_at: string | null;
  identity_verified_at: string | null;
  created_at: string;
}

export interface PaymentRecord {
  id: string;
  sender_user_id: string | null;
  sender_wallet: string;
  sender_display_name_snapshot: string;
  sender_handle_snapshot: string;
  reference_code: string;
  receiver_phone: string;
  receiver_phone_hash: string;
  token_symbol: string;
  amount: string;
  escrow_account: string | null;
  notification_message_id: string | null;
  status: PaymentStatus;
  created_at: string;
}

export interface PhoneVerificationRecord {
  id: string;
  phone_number: string;
  otp_code: string;
  purpose: string;
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
