"use client";

import { formatPaymentNotificationStatus } from "@/src/lib/formatters";
import type { PaymentNotificationStatus } from "@/src/lib/types";
import { WhatsAppIcon } from "@/src/components/whatsapp-icon";

function ReceiptTicks({ status }: { status: PaymentNotificationStatus }) {
  const stroke = status === "read" ? "#71b7ff" : status === "delivered" ? "#dce7f7" : "#f4f7fb";

  if (status === "failed") {
    return (
      <svg viewBox="0 0 20 14" fill="none" aria-hidden="true" className="h-3.5 w-4.5 text-[#ff9c9c]">
        <path d="M5 3l10 8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        <path d="M15 3 5 11" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
    );
  }

  if (status === "queued") {
    return <span className="h-2 w-2 rounded-full bg-[#f3c96b]" aria-hidden="true" />;
  }

  return (
    <svg viewBox="0 0 20 14" fill="none" aria-hidden="true" className="h-3.5 w-4.5">
      <path
        d="m1.8 7.6 2.3 2.3 4-5"
        stroke={stroke}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={status === "sent" ? 1 : 0.6}
      />
      {status === "delivered" || status === "read" ? (
        <path
          d="m7.8 7.6 2.3 2.3 4-5"
          stroke={stroke}
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

export function PaymentNotificationReceipt({
  status,
  className = ""
}: {
  status: PaymentNotificationStatus;
  className?: string;
}) {
  const label = `WhatsApp ${formatPaymentNotificationStatus(status)}`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/20 px-2 py-1 text-white/88 ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      <WhatsAppIcon className="h-3.5 w-3.5" />
      <ReceiptTicks status={status} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
