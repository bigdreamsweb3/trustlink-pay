import { listLockedPaymentsByPhoneNumber, listPaymentHistory } from "@/app/db/payments";
import type { AuthenticatedUser } from "@/app/types/auth";

import { enrichPaymentInviteState } from "./invite";
import { retryOutstandingNotifications } from "./notifications";
import { enrichPaymentsWithTsnState, isTsnSettled } from "@/app/services/tsn";

export async function listLockedPaymentsForUser(phoneNumber: string) {
  const payments = await listLockedPaymentsByPhoneNumber(phoneNumber);
  const refreshedPayments = await retryOutstandingNotifications(payments);
  const enriched = await Promise.all(refreshedPayments.map(enrichPaymentInviteState));
  const withTsn = await enrichPaymentsWithTsnState(enriched);

  // TSN receiver semantics: once a Cranker pays out, the receiver should no longer see the escrow as claimable.
  return withTsn.filter((payment) => !isTsnSettled(payment));
}

export async function listPaymentHistoryForUser(authUser: AuthenticatedUser, limit?: number) {
  const payments = await listPaymentHistory({
    userId: authUser.id,
    phoneNumber: authUser.phoneNumber,
    limit,
  });

  const refreshedPayments = await retryOutstandingNotifications(payments);
  const enriched = await Promise.all(refreshedPayments.map(enrichPaymentInviteState));
  return enrichPaymentsWithTsnState(enriched);
}
