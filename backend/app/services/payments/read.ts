import { listClaimablePaymentsByPhoneNumber, listPaymentHistory } from "@/app/db/payments";
import type { AuthenticatedUser } from "@/app/types/auth";

import { enrichPaymentInviteState } from "./invite";
import { retryOutstandingNotifications } from "./notifications";
import { enrichPaymentsWithTsnState, isTsnSettled } from "@/app/services/tsn";

function isTsnEscrowClaimable(payment: { tsn?: { intentStatus: string } }) {
  return payment.tsn?.intentStatus === "onchain" || payment.tsn?.intentStatus === "claimed";
}

function isLegacyClaimable(payment: { status: string }) {
  return payment.status === "locked" || payment.status === "expired";
}

export async function listLockedPaymentsForUser(phoneNumber: string) {
  const payments = await listClaimablePaymentsByPhoneNumber(phoneNumber);
  const refreshedPayments = await retryOutstandingNotifications(payments);
  const enriched = await Promise.all(refreshedPayments.map(enrichPaymentInviteState));
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
  const enriched = await Promise.all(refreshedPayments.map(enrichPaymentInviteState));
  return enrichPaymentsWithTsnState(enriched);
}
