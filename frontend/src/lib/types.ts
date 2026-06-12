export interface UserProfile {
  id: string;
  phoneNumber: string;
  tin?: string | null;
  tinsIdentityPublicKey?: string | null;
  tinsRegistryPublicKey?: string | null;
  tinsWalletPublicKey?: string | null;
  tinsProgramId?: string | null;
  tinsCreatedAt?: string | null;
  displayName: string;
  handle: string;
  walletAddress: string | null;
  pinConfigured?: boolean;
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
  settlementWallet?: string;
  recoveryWallet: string | null;
  isFrozen: boolean;
  recoveryCooldown: string;
  createdAt: string;
  updatedAt: string;
  bump: number;
}

export interface TinIdentityState {
  tin: string | null;
  tinsIdentityPublicKey: string | null;
  tinsRegistryPublicKey: string | null;
  tinsWalletPublicKey: string | null;
  tinsProgramId: string | null;
  tinsCreatedAt?: string | null;
}

export type IdentitySecurityResponse = TinIdentityState & {
  identity: IdentitySecurityState | null;
  phoneIdentityPublicKey?: string | null;
  privacyViewPublicKey?: string | null;
  privacySpendPublicKey?: string | null;
  bindingSignature?: string | null;
  settlementWalletPublicKey?: string | null;
  recoveryWalletPublicKey?: string | null;
  receiverAutoclaimEnabled?: boolean;
};

export type PaymentNotificationStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type PaymentViewerRole = "sender" | "receiver";
export type PaymentMode = "secure" | "invite";

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
  receiver_display_name?: string | null;
  receiver_handle?: string | null;
  receiver_tin?: string | null;
  receiver_tins_identity_pubkey?: string | null;
  payment_mode?: PaymentMode;
  recipient_onboarded_at_creation?: boolean;
  phone_identity_pubkey?: string | null;
  payment_receiver_pubkey?: string | null;
  ephemeral_pubkey?: string | null;
  refund_receiver_pubkey?: string | null;
  refund_ephemeral_pubkey?: string | null;
  token_symbol: string;
  token_mint_address?: string | null;
  amount: string;
  sender_fee_amount?: string | null;
  claim_fee_amount?: string | null;
  escrow_account: string | null;
  escrow_vault_address?: string | null;
  deposit_signature: string | null;
  release_signature: string | null;
  refund_release_signature?: string | null;
  expiry_signature?: string | null;
  released_to_wallet: string | null;
  refund_released_to_wallet?: string | null;
  accepted_at: string | null;
  refund_requested_at?: string | null;
  refund_claim_available_at?: string | null;
  refund_extension_count?: number;
  refund_claimed_at?: string | null;
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
  status: "created" | "locked" | "claimed" | "refund_requested" | "refunded";
  tsn?: {
    stage: "intent_pending" | "claim_requested" | "escrowed" | "lease_claimed" | "cranker_paid" | "epoch_settled" | "reverted";
    intentStatus: "pending" | "escrowed" | "onchain" | "claimed" | "executed" | "settled" | "expired" | "failed" | "canceled" | "reverted";
    claimRequestStatus: "pending" | "processing" | "completed" | "canceled" | "failed" | null;
    destinationWallet: string | null;
    assignedCrankerPubkey: string | null;
    escrowTxSig: string | null;
    claimTxSig: string | null;
    proofTxSig: string | null;
    settlementReason?: string | null;
  };
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

export interface TsnClaimRequestResult {
  paymentId: string;
  intentId: string;
  claimRequestId: string;
  destinationWallet: string;
  status: "pending" | "processing" | "completed" | "canceled" | "failed";
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
    displayName: string;
    handle: string | null;
    tin: string | null;
    tinsIdentityPublicKey: string | null;
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
    tsnEscrowSignature?: string | null;
    tsnEscrowExplorerUrl?: string | null;
    tsnClaimSignature?: string | null;
    tsnClaimExplorerUrl?: string | null;
    tsnProofSignature?: string | null;
    tsnProofExplorerUrl?: string | null;
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
  decimals?: number;
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

export type RecipientSocialIdentity = {
  type: string;
  label: string;
  value: string;
  verifiedBy: string | null;
};

type RecipientIdentityDetails = {
  tin?: string | null;
  identityName?: string | null;
  legalName?: string | null;
  legalNameStatus?: "verified" | "not_available";
  settlementWallet?: string | null;
  registryAddress?: string | null;
  trustLinkLinked?: boolean;
  socialIdentities?: RecipientSocialIdentity[];
};

export type RecipientLookupResult =
  | {
      status: "invalid_whatsapp_number";
      verified: false;
      recipient: RecipientIdentityDetails & {
        displayName: string;
        handle: null;
        phoneNumber: string;
        source: "invalid";
        tin?: string | null;
        whatsappProfileName: null;
      };
      warning: string;
    }
  | {
      status: "registered";
      verified: true;
      recipient: RecipientIdentityDetails & {
        displayName: string;
        handle: string;
        phoneNumber: string;
        source: "trustlink" | "tins";
        tin?: string | null;
        whatsappProfileName: string | null;
      };
    }
  | {
      status: "tins_resolved";
      verified: true;
      recipient: RecipientIdentityDetails & {
        displayName: string;
        handle: string | null;
        phoneNumber: string;
        source: "tins";
        tin: string;
        whatsappProfileName: string | null;
        identityName: string | null;
        legalName: string | null;
        legalNameStatus: "verified" | "not_available";
        settlementWallet: string;
        registryAddress: string;
        trustLinkLinked: boolean;
        socialIdentities: RecipientSocialIdentity[];
      };
      warning?: string;
    }
  | {
      status: "whatsapp_only";
      verified: true;
      recipient: RecipientIdentityDetails & {
        displayName: string;
        handle: null;
        phoneNumber: string;
        source: "whatsapp";
        tin?: string | null;
        whatsappProfileName: string;
      };
      warning: string;
    }
  | {
      status: "manual_invite_required";
      verified: true;
      recipient: RecipientIdentityDetails & {
        displayName: string;
        handle: null;
        phoneNumber: string;
        source: "manual_invite";
        tin?: string | null;
        whatsappProfileName: null;
      };
      warning: string;
    };
