import { listClaimablePaymentsByPhoneNumber, listPaymentHistory } from "@/app/db/payments";
import { findUserByPhoneNumber } from "@/app/db/users";
import type { AuthenticatedUser } from "@/app/types/auth";
import type { PaymentRecord } from "@/app/types/payment";

import { enrichPaymentInviteState } from "./invite";
import { retryOutstandingNotifications } from "./notifications";
import { enrichPaymentsWithTsnState, isTsnSettled } from "@/app/services/tsn";

function isTsnEscrowClaimable(payment: { tsn?: { intentStatus: string } }) {
  return payment.tsn?.intentStatus === "escrowed" || payment.tsn?.intentStatus === "onchain" || payment.tsn?.intentStatus === "claimed";
}

function isLegacyClaimable(payment: { status: string }) {
  return payment.status === "locked" || payment.status === "expired";
}

async function enrichReceiverIdentity(payments: PaymentRecord[]) {
  const receiverPhones = [...new Set(payments.map((payment) => payment.receiver_phone).filter(Boolean))];

  if (receiverPhones.length === 0) {
    return payments;
  }

  const receiverEntries = await Promise.all(
    receiverPhones.map(async (phoneNumber) => {
      const receiver = await findUserByPhoneNumber(phoneNumber);
      return [phoneNumber, receiver] as const;
    }),
  );
  const receiversByPhone = new Map(receiverEntries);

  return payments.map((payment) => {
    const receiver = receiversByPhone.get(payment.receiver_phone) ?? null;

    return {
      ...payment,
      receiver_display_name: receiver?.display_name ?? payment.receiver_display_name ?? null,
      receiver_handle: receiver?.trustlink_handle ?? payment.receiver_handle ?? null,
      receiver_tin: receiver?.tin ?? payment.receiver_tin ?? null,
      receiver_tins_identity_pubkey:
        receiver?.tins_identity_pubkey ?? payment.receiver_tins_identity_pubkey ?? null,
    };
  });
}

export async function listLockedPaymentsForUser(phoneNumber: string) {
  const payments = await listClaimablePaymentsByPhoneNumber(phoneNumber);
  const refreshedPayments = await retryOutstandingNotifications(payments);
  const withReceiverIdentity = await enrichReceiverIdentity(refreshedPayments);
  const enriched = await Promise.all(withReceiverIdentity.map(enrichPaymentInviteState));
  const withTsn = await enrichPaymentsWithTsnState(enriched);

  // Receiver semantics: every escrowed TSN payment stays visible as a claim until payout/proof is settled.
  // Claim failures remain retryable for the recipient, but sender activity should still read as escrowed.
  return withTsn.filter((payment) => {
    if (isTsnSettled(payment)) return false;
    if (isTsnEscrowClaimable(payment)) return true;
    return isLegacyClaimable(payment);
  });
}

export async function listPaymentHistoryForUser(authUser: AuthenticatedUser, limit?: number) {
  const payments = await listPaymentHistory({
    userId: authUser.id,
    phoneNumber: authUser.phoneNumber,
    limit,
  });

  const refreshedPayments = await retryOutstandingNotifications(payments);
  const withReceiverIdentity = await enrichReceiverIdentity(refreshedPayments);
  const enriched = await Promise.all(withReceiverIdentity.map(enrichPaymentInviteState));
  return enrichPaymentsWithTsnState(enriched);
}
