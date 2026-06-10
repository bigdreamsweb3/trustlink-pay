import type { PaymentNotificationStatus, PaymentRecord, RecipientLookupResult, WhatsAppNumberVerificationResult } from "@/src/lib/types";
import type { CountryOption } from "@/src/lib/phone-countries";

export type SendFormState = {
  receiverPhone: string;
  amount: string;
  token: string;
};

export type SendSuccessState = {
  paymentId: string;
  status: PaymentRecord["status"];
  notificationStatus: PaymentNotificationStatus;
  notificationSentAt: string | null;
  notificationDeliveredAt: string | null;
  notificationReadAt: string | null;
  notificationFailedAt: string | null;
  referenceCode: string;
  senderDisplayName: string;
  senderHandle: string;
  escrowAccount: string | null;
  blockchainSignature: string;
  blockchainMode: "tsn" | "mock" | "devnet";
  depositAddress: string | null;
  notificationRetrying: boolean;
  notificationAttemptCount: number;
  manualInviteRequired: boolean;
  inviteShare: { onboardingLink: string; inviteMessage: string } | null;
  receiverPhone: string;
  recipientName: string;
  amount: string;
  token: string;
};

export type PhoneVerificationDetails = {
  displayName: string | null;
  profilePic: string | null;
  exists: boolean;
  isBusiness: boolean;
  url: string;
  resolvedPhoneNumber?: string | null;
  detectedCountry?: CountryOption | null;
};

export type RecipientVerificationState = "idle" | "checking" | "valid" | "warning" | "invalid";

export type ResolvedRecipientLookup = {
  verification: WhatsAppNumberVerificationResult;
  recipient: RecipientLookupResult | null;
  normalizedPhone: string;
  country: CountryOption | null;
};
