import { env } from "@/app/lib/env";
import type { PaymentRecord, UserRecord } from "@/app/types/payment";

export function hasSecurePrivacyRouting(user: Pick<
  UserRecord,
  "phone_identity_pubkey" | "privacy_view_pubkey" | "privacy_spend_pubkey"
>) {
  return Boolean(user.phone_identity_pubkey && user.privacy_view_pubkey && user.privacy_spend_pubkey);
}

export function addBusinessDays(startAt: Date, businessDays: number) {
  const next = new Date(startAt);
  let remaining = businessDays;

  while (remaining > 0) {
    next.setUTCDate(next.getUTCDate() + 1);
    const weekday = next.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }

  return next;
}

export function getInviteExpiryAt(startAt = new Date()) {
  return addBusinessDays(startAt, env.TRUSTLINK_INVITE_EXPIRY_BUSINESS_DAYS);
}

export function enforceInvitePaymentCap(params: {
  amountUsd: number | null;
  tokenSymbol: string;
  amount: number;
}) {
  if (params.amountUsd == null) {
    throw new Error(`Could not determine ${params.tokenSymbol} USD price for invite payment limit enforcement`);
  }

  if (params.amountUsd > env.TRUSTLINK_INVITE_PAYMENT_MAX_USD) {
    throw new Error(
      `Payments to non-TrustLink recipients are limited to ${env.TRUSTLINK_INVITE_PAYMENT_MAX_USD} USD until they onboard`,
    );
  }
}

export function getRefundClaimAvailableAt(requestedAt = new Date(), extensionCount = 0) {
  const totalHours =
    env.TRUSTLINK_REFUND_WAIT_HOURS + extensionCount * env.TRUSTLINK_REFUND_ENGAGEMENT_EXTENSION_HOURS;
  return new Date(requestedAt.getTime() + totalHours * 60 * 60 * 1000);
}

export function isInvitePayment(payment: Pick<PaymentRecord, "payment_mode">) {
  return payment.payment_mode === "invite";
}

