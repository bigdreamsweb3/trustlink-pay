import { findUserByPhoneNumber } from "@/app/db/users";
import { env } from "@/app/lib/env";
import type { PaymentRecord } from "@/app/types/payment";

export function buildInviteShareData(payment: PaymentRecord) {
  const onboardingLink = `${env.APP_BASE_URL.replace(/\/$/, "")}/auth?redirect=${encodeURIComponent(`/claim/${payment.id}`)}`;
  const inviteMessage = [
    `I just sent you ${payment.amount} ${payment.token_symbol} using your WhatsApp number through TrustLink.`,
    "",
    "To claim it, register your number on TrustLink using this link:",
    "",
    onboardingLink,
    "",
    `Transaction reference: ${payment.reference_code}`,
  ].join("\n");

  return {
    onboardingLink,
    inviteMessage,
  };
}

export async function requiresManualInvite(phoneNumber: string) {
  const receiver = await findUserByPhoneNumber(phoneNumber);
  return !receiver?.phone_verified_at || !receiver.whatsapp_opted_in;
}

export async function enrichPaymentInviteState(payment: PaymentRecord) {
  const manualInviteRequired = await requiresManualInvite(payment.receiver_phone);

  return {
    ...payment,
    manual_invite_required: manualInviteRequired,
    invite_share: manualInviteRequired ? buildInviteShareData(payment) : null,
    recipient_onboarded: !manualInviteRequired,
  };
}
