import type { PaymentNotificationStatus } from "@/src/lib/types";

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
