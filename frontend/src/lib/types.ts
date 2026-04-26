export interface UserProfile {
  id: string;
  phoneNumber: string;
  displayName: string;
  handle: string;
  walletAddress: string | null;
  whatsappOptedIn?: boolean;
  optInTimestamp?: string | null;
  optOutTimestamp?: string | null;
  phoneVerifiedAt: string | null;
  identityVerifiedAt: string | null;
  referredByUserId?: string | null;
  referralSourcePaymentId?: string | null;
  referredAt?: string | null;
  createdAt: string;
}

export type PinMode = "setup" | "verify";

export interface PendingAuthSession {
  challengeToken: string;
  pinMode: PinMode;
  user: UserProfile;
  redirectTo: string;
}

export interface ReceiverWallet {
  id: string;
  user_id: string;
  wallet_name: string;
  wallet_address: string;
  created_at: string;
}

export interface IdentitySecurityState {
  address: string;
  mainWallet: string;
  recoveryWallet: string | null;
  isFrozen: boolean;
  recoveryCooldown: string;
  createdAt: string;
  updatedAt: string;
  bump: number;
}

export type PaymentNotificationStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type PaymentViewerRole = "sender" | "receiver";

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
  token_mint_address?: string | null;
  amount: string;
  sender_fee_amount?: string | null;
  claim_fee_amount?: string | null;
  escrow_account: string | null;
  escrow_vault_address?: string | null;
  deposit_signature: string | null;
  release_signature: string | null;
  expiry_signature?: string | null;
  released_to_wallet: string | null;
  accepted_at: string | null;
  expiry_at?: string | null;
  expired_to_pool_at?: string | null;
  recovery_wallet_address?: string | null;
  notification_message_id: string | null;
  notification_status: PaymentNotificationStatus;
  notification_sent_at: string | null;
  notification_delivered_at: string | null;
  notification_read_at: string | null;
  notification_failed_at: string | null;
  notification_attempt_count?: number;
  notification_last_attempt_at?: string | null;
  status: "pending" | "accepted" | "cancelled" | "expired";
  unit_price_usd?: number | null;
  amount_usd?: number | null;
  created_at: string;
  viewer_role?: PaymentViewerRole;
  manual_invite_required?: boolean;
  invite_share?: {
    onboardingLink: string;
    inviteMessage: string;
  } | null;
  recipient_onboarded?: boolean;
}

export interface PendingBalanceSummary {
  claimableCount: number;
  totalPendingUsd: number;
  byToken: Array<{
    tokenSymbol: string;
    amount: number;
    amountUsd: number | null;
  }>;
}

export interface PaymentTimelineEntry {
  id: string;
  label: string;
  description: string;
  occurredAt: string | null;
  complete: boolean;
}

export interface PaymentDetailResponse {
  payment: PaymentRecord;
  viewerRole: PaymentViewerRole;
  sender: {
    displayName: string;
    handle: string;
    referenceCode: string;
    phoneMasked: string | null;
    trustVerified: boolean;
    trustStatusLabel: string;
    contactShared: boolean;
  };
  receiver: {
    phone: string;
    releasedWallet: string | null;
    claimReady: boolean;
    onboarded: boolean;
    manualInviteRequired: boolean;
    inviteShare: {
      onboardingLink: string;
      inviteMessage: string;
    } | null;
  };
  trace: {
    paymentId: string;
    escrowAccount: string | null;
    depositSignature: string | null;
    depositExplorerUrl: string | null;
    releaseSignature: string | null;
    releaseExplorerUrl: string | null;
    expirySignature?: string | null;
    expiryExplorerUrl?: string | null;
    acceptedAt: string | null;
  };
  privacy: {
    senderWalletVisibleToReceiver: boolean;
    senderPhoneVisibleToReceiver: boolean;
    senderPhonePolicy: string;
    deliveryChannelNote: string;
  };
  whatsapp: {
    notificationMessageId: string | null;
    status: PaymentNotificationStatus;
    sentAt: string | null;
    deliveredAt: string | null;
    readAt: string | null;
    failedAt: string | null;
    eventCount: number;
  };
  timeline: PaymentTimelineEntry[];
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

export interface WhatsAppNumberVerificationResult {
  phoneNumber: string;
  exists: boolean;
  accountType: "business" | "personal_or_none";
  displayName: string | null;
  profilePic: string | null;
  hasProfilePic: boolean;
  isBusiness: boolean;
  isInvalid: boolean;
  url: string;
  source: "trustlink_scraper" | "mock";
}

export type RecipientLookupResult =
  | {
      status: "invalid_whatsapp_number";
      verified: false;
      recipient: {
        displayName: string;
        handle: null;
        phoneNumber: string;
        source: "invalid";
        whatsappProfileName: null;
      };
      warning: string;
    }
  | {
      status: "registered";
      verified: true;
      recipient: {
        displayName: string;
        handle: string;
        phoneNumber: string;
        source: "trustlink";
        whatsappProfileName: string | null;
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
        whatsappProfileName: string;
      };
      warning: string;
    }
  | {
      status: "manual_invite_required";
      verified: true;
      recipient: {
        displayName: string;
        handle: null;
        phoneNumber: string;
        source: "manual_invite";
        whatsappProfileName: null;
      };
      warning: string;
    };
