"use client";

import { formatPaymentNotificationStatus } from "@/src/lib/formatters";
import type { PaymentNotificationStatus } from "@/src/lib/types";

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <circle cx="12" cy="12" r="10" fill="#25D366" />
      <path
        d="M12 6.75a5.03 5.03 0 0 0-4.97 5.8l-.62 3.07 3.13-.58A5.02 5.02 0 1 0 12 6.75Z"
        fill="white"
        fillOpacity="0.98"
      />
      <path
        d="M14.66 13.54c-.15.43-.87.8-1.2.85-.31.05-.7.07-1.13-.07-.26-.08-.59-.19-1.02-.38-1.79-.77-2.95-2.57-3.04-2.69-.08-.11-.73-.98-.73-1.88 0-.89.47-1.33.64-1.51.16-.18.36-.22.48-.22s.24 0 .35.01c.11.01.26-.04.41.31.15.37.51 1.27.55 1.36.05.09.08.2.02.31-.06.11-.09.18-.18.28-.09.1-.18.22-.26.29-.09.09-.18.18-.08.35.1.17.45.74.96 1.2.66.58 1.22.76 1.39.85.17.09.27.07.37-.04.1-.11.43-.49.54-.66.11-.16.23-.14.39-.08.16.06 1 .47 1.17.55.17.09.28.13.32.2.04.07.04.42-.11.85Z"
        fill="#25D366"
      />
    </svg>
  );
}

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
      <WhatsAppMark />
      <ReceiptTicks status={status} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
