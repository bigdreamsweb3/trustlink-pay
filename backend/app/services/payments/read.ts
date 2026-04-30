import { listLockedPaymentsByPhoneNumber, listPaymentHistory } from "@/app/db/payments";
import type { AuthenticatedUser } from "@/app/types/auth";

import { enrichPaymentInviteState } from "./invite";
import { retryOutstandingNotifications } from "./notifications";

export async function listLockedPaymentsForUser(phoneNumber: string) {
  const payments = await listLockedPaymentsByPhoneNumber(phoneNumber);
  const refreshedPayments = await retryOutstandingNotifications(payments);
  return Promise.all(refreshedPayments.map(enrichPaymentInviteState));
}

export async function listPaymentHistoryForUser(authUser: AuthenticatedUser, limit?: number) {
  const payments = await listPaymentHistory({
    userId: authUser.id,
    phoneNumber: authUser.phoneNumber,
    limit,
  });

  const refreshedPayments = await retryOutstandingNotifications(payments);
  return Promise.all(refreshedPayments.map(enrichPaymentInviteState));
}
