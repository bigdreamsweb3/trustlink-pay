<<<<<<< HEAD
import { findUserByPhoneNumber } from "@/app/db/users";
import { resolveAppBaseUrl } from "@/app/lib/app-url";
import type { PaymentRecord } from "@/app/types/payment";

export function buildInviteShareData(payment: PaymentRecord, appBaseUrl?: string | null) {
  const onboardingLink = `${resolveAppBaseUrl(appBaseUrl)}/auth?redirect=${encodeURIComponent(`/claim/${payment.id}`)}`;
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
  // Treat any phone-verified TrustLink user as onboarded for notifications.
  // Manual invites are only for numbers not yet onboarded in the TrustLink DB.
  return !receiver?.phone_verified_at;
}

export async function enrichPaymentInviteState(payment: PaymentRecord) {
  const currentlyRequiresManualInvite = await requiresManualInvite(payment.receiver_phone);
  const manualInviteRequired =
    payment.status === "locked" &&
    payment.payment_mode === "invite" &&
    currentlyRequiresManualInvite;

  return {
    ...payment,
    manual_invite_required: manualInviteRequired,
    invite_share: manualInviteRequired ? buildInviteShareData(payment) : null,
    receiver_onboarded: payment.receiver_onboarded ?? !manualInviteRequired,
  };
=======
/**
 * Invite Service - Placeholder
 * 
 * This module handles invite-based payment sharing.
 * Currently handled by TSN protocol.
 */

import type { PaymentRecord } from "@/app/types/payment";

export interface InviteShareData {
  inviteMessage: string;
  inviteUrl: string;
}

export function buildInviteShareData(
  _payment: PaymentRecord,
  _appBaseUrl?: string | null
): InviteShareData {
  // Placeholder - TSN handles invites
  return {
    inviteMessage: "Share payment link",
    inviteUrl: "",
  };
}

export async function requiresManualInvite(receiverPhone: string): Promise<boolean> {
  // Placeholder - TSN handles invites
  // Check if receiver needs manual invite
  console.log("Invite check for:", receiverPhone);
  return false;
}

export function enrichPaymentInviteState(payment: PaymentRecord): PaymentRecord {
  // Placeholder - TSN handles invites
  return payment;
>>>>>>> 8c3dc1f (fix: Resolve TSN SDK import conflicts and add missing type definitions)
}