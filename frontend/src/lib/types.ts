export interface UserProfile {
  id: string;
  phoneNumber: string;
  displayName: string;
  handle: string;
  walletAddress: string | null;
  phoneVerifiedAt: string | null;
  identityVerifiedAt: string | null;
  createdAt: string;
}

export interface ReceiverWallet {
  id: string;
  user_id: string;
  wallet_name: string;
  wallet_address: string;
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
  status: "pending" | "accepted" | "cancelled" | "expired";
  unit_price_usd?: number | null;
  amount_usd?: number | null;
  created_at: string;
}

export interface AuthResult {
  accessToken: string;
  user: UserProfile;
}

export interface WalletTokenOption {
  symbol: string;
  name: string;
  balance: number;
  logo: string;
  mintAddress: string;
  supported: boolean;
  unitPriceUsd?: number | null;
  balanceUsd?: number | null;
}

export type RecipientLookupResult =
  | {
      status: "registered";
      verified: true;
      recipient: {
        displayName: string;
        handle: string;
        phoneNumber: string;
        source: "trustlink";
      };
    }
  | {
      status: "whatsapp_only";
      verified: true;
      recipient: {
        displayName: string;
        handle: null;
        phoneNumber: string;
        source: "whatsapp";
      };
      warning: string;
    }
  | {
      status: "unverified";
      verified: false;
      message: string;
    };
