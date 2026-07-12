export type WhatsAppUserProfile = {
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
};

export type WhatsAppPaymentRecord = {
  id: string;
  notification_message_id?: string | null;
};

export type WhatsAppPaymentNotificationStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export type WhatsAppWebhookEventRecord = unknown;

export type WhatsAppSessionCode = {
  code: string;
  sessionId: string;
  status: "pending" | "awaiting_confirmation" | "verified" | "declined" | "expired" | string;
  phoneNumber?: string;
  createdAt: Date;
  expiresAt: Date;
  requestContext?: {
    device?: string;
    location?: string;
    requestedAt?: string;
  };
};


export type WhatsAppSdkPorts = {
  users: {
    findByPhoneNumber(phoneNumber: string): Promise<WhatsAppUserProfile | null>;
    upsertProfile(params: {
      phoneNumber: string;
      phoneHash: string;
      displayName: string;
      handle: string;
      pinHash: string;
    }): Promise<WhatsAppUserProfile>;
    markOptIn(params: {
      phoneNumber: string;
      phoneHash: string;
      displayName?: string;
      optedInAt: Date;
    }): Promise<WhatsAppUserProfile | null>;
    markOptOut(params: {
      phoneNumber: string;
      optedOutAt: Date;
    }): Promise<WhatsAppUserProfile | null>;
  };
  payments: {
    findByNotificationMessageId(messageId: string): Promise<WhatsAppPaymentRecord | null>;
    findByNotificationMessageEventId(messageId: string): Promise<WhatsAppPaymentRecord | null>;
    updateNotificationMessageId(paymentId: string, messageId: string): Promise<WhatsAppPaymentRecord | null>;
    updateNotificationStatus(paymentId: string, status: WhatsAppPaymentNotificationStatus, occurredAt: string | null): Promise<WhatsAppPaymentRecord | null>;
  };
  webhookEvents: {
    create(params: {
      eventType: string;
      messageId?: string | null;
      relatedPaymentId?: string | null;
      phoneNumber?: string | null;
      direction?: string | null;
      status?: string | null;
      payload: unknown;
    }): Promise<WhatsAppWebhookEventRecord>;
  };
  sessions: {
    findSessionCode(code: string): Promise<WhatsAppSessionCode | null>;
    findPendingSessionForPhone(phoneNumber: string, replyMessageId?: string | null): Promise<WhatsAppSessionCode | null>;
    markSessionAwaitingConfirmation(code: string, phoneNumber: string, reviewMessageId?: string | null): Promise<WhatsAppSessionCode | null>;
    markSessionDeclined(code: string, phoneNumber?: string): Promise<WhatsAppSessionCode | null>;
    verifySessionCode(code: string, phoneNumber: string): Promise<WhatsAppSessionCode | null>;
  };
  auth: {
    issueChallengeToken(params: {
      id: string;
      phoneNumber: string;
      stage: "pin_verify" | "pin_setup" | string;
    }): string;
    sanitizeUser(user: WhatsAppUserProfile): unknown;
    notifySessionVerification(sessionId: string, payload: {
      challengeToken: string;
      user: unknown;
      stage: "pin_verify" | "pin_setup" | string;
      status?: "verified";
    }): void | Promise<void>;
  };
  phoneVerification: {
    sendOtp(phoneNumber: string, purpose: "auth" | "payment" | string): Promise<unknown>;
  };
};

let configuredPorts: WhatsAppSdkPorts | null = null;

export function configureWhatsAppSdkPorts(ports: WhatsAppSdkPorts) {
  configuredPorts = ports;
}

export function getWhatsAppSdkPorts(): WhatsAppSdkPorts {
  if (!configuredPorts) {
    throw new Error("WhatsApp SDK ports are not configured. Backend must inject persistence adapters before use.");
  }

  return configuredPorts;
}
