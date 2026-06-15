import type { PaymentNotificationStatus, PaymentRecord } from "@/src/lib/types";

export function formatTokenAmount(value: string | number, maximumFractionDigits = 9) {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(numericValue);
}

export function formatPaymentNotificationStatus(status: PaymentNotificationStatus | null | undefined) {
  switch (status) {
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "read":
      return "Seen";
    case "failed":
      return "Failed";
    case "queued":
    default:
      return "Queued";
  }
}

export function isPaymentNotificationFinal(status: PaymentNotificationStatus | null | undefined) {
  return status === "read" || status === "failed";
}

export function shouldPollPaymentNotification(status: PaymentNotificationStatus | null | undefined) {
  return status === "queued" || status === "sent" || status === "delivered";
}

export function shouldPollTsnPayment(payment: Pick<PaymentRecord, "tsn">) {
  const status = payment.tsn?.intentStatus;
  return (
    status === "pending" ||
    status === "escrowed" ||
    status === "onchain" ||
    status === "claimed"
  );
}

/** Statuses that are terminal — once reached, never query TSN again. */
export const TERMINAL_TSN_STATUSES = new Set([
  "executed",
  "settled",
  "expired",
  "failed",
  "canceled",
  "reverted",
]);

export function isTsnStatusFinal(intentStatus: string | null | undefined): boolean {
  return intentStatus ? TERMINAL_TSN_STATUSES.has(intentStatus) : false;
}

/** Compute the next polling interval based on check count and status. */
export function computeRefreshIntervalMs(
  checkCount: number,
  isFinalized: boolean,
): number | null {
  if (isFinalized) return null;
  // Exponential backoff: 4s, 8s, 16s, 30s, 30s (capped)
  const intervals = [4_000, 8_000, 16_000, 30_000, 30_000];
  const index = Math.min(checkCount, intervals.length - 1);
  return intervals[index];
}
