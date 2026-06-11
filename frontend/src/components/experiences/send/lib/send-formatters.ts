import type { PaymentRecord } from "@/src/lib/types";

export function paymentStatusLabel(status: PaymentRecord["status"]) {
  if (status === "created") return "processing";
  return status.replace(/_/g, " ");
}

export function formatTokenBalance(balance: number, symbol: string) {
  const digits = symbol === "SOL" ? 4 : 2;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(balance);
}

export function formatReceiptTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
