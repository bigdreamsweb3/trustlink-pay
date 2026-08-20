import { listClaimablePaymentsByPhoneNumber, listPaymentHistory } from "@/app/db/payments";
import { findUserByPhoneNumber } from "@/app/db/users";
import type { AuthenticatedUser } from "@/app/types/auth";
import type { PaymentRecord } from "@/app/types/payment";

import { enrichPaymentInviteState } from "./invite";
import { retryOutstandingNotifications } from "./notifications";
import { enrichPaymentsWithTsnState, isTsnSettled } from "@/app/services/tsn";

function isTsnSettlementPending(payment: { tsn?: { intentStatus: string } }) {
  return payment.tsn?.intentStatus === "pending" || payment.tsn?.intentStatus === "onchain";
}

function isPendingPayment(payment: { status: string }) {
  return payment.status === "locked" || payment.status === "expired";
}

async function enrichReceiverIdentity(payments: PaymentRecord[]) {
  const receiverPhones = [
    ...new Set(
      payments
        .map((payment) => payment.receiver_phone)
        .filter(
          (phoneNumber): phoneNumber is string =>
            Boolean(phoneNumber) && !phoneNumber.startsWith("tin:"),
        ),
    ),
  ];

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

  // Receiver semantics: every funded TSN intent stays visible until its opaque slot settles or refunds.
  return withTsn.filter((payment) => {
    if (isTsnSettled(payment)) return false;
    if (isTsnSettlementPending(payment)) return true;
    return isPendingPayment(payment);
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
