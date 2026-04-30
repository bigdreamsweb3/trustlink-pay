"use client";

import { PaymentNotificationReceipt } from "@/src/components/payment-notification-receipt";
import { ReceiveIcon, SendIcon } from "@/src/components/app-icons";
import { formatTokenAmount } from "@/src/lib/formatters";
import { formatPaymentShortDate, formatPaymentUsd } from "@/src/lib/payment-display";
import type { PaymentRecord } from "@/src/lib/types";

type PaymentActivityCardProps = {
  payment: PaymentRecord;
  currentUserId: string;
  onClick: (paymentId: string) => void;
};

function statusTone(status: PaymentRecord["status"]) {
  switch (status) {
    case "locked":
      return "bg-[#0f261d] text-[#79ffcf]";
    case "created":
      return "bg-[#2a2412] text-[#f3c96b]";
    case "claimed":
      return "bg-[#0f261d] text-[#79ffcf]";
    case "refund_requested":
      return "bg-[#2a2412] text-[#f3c96b]";
    default:
      return "bg-[#321516] text-[#ff9c9c]";
  }
}

export function PaymentActivityCard({
  payment,
  currentUserId,
  onClick,
}: PaymentActivityCardProps) {
  const isSend = payment.sender_user_id === currentUserId;
  const counterparty = isSend
    ? `To ${payment.receiver_phone}`
    : `From ${payment.sender_display_name_snapshot}`;

  return (
    <button
      type="button"
      onClick={() => onClick(payment.id)}
      className="grid w-[calc(100%+autorem)]  grid-cols-[auto_1fr_auto] items-center gap-3 py-3 px-4 sm:px-4.5 text-left transition button tl-field"
    >
      <div
        className={`grid h-8 w-8 place-items-center rounded-[18px] text-[0.68rem] font-bold tracking-[0.14em] border-b border-[#76ffd8]/60 ${isSend ? "text-[#99cfff]" : "text-[#79ffcf]"
          }`}
      >
        {isSend ? <SendIcon className="h-4.5 w-4.5" /> : <ReceiveIcon className="h-4.5 w-4.5" />}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5 whitespace-nowrap text-[0.76rem] font-semibold text-text">
          <span className="truncate">{counterparty}</span>
          <span className="shrink-0 text-text/28">-</span>
          <span className="tl-coord-text inline-flex shrink-0 items-center gap-1.5 !text-[0.56rem] leading-none">
            <span>{payment.reference_code}</span>
            <span className="opacity-45">::</span>
            <span>{isSend ? "Sent" : "Received"}</span>
          </span>
        </div>
        {/* <div className="truncate text-[0.7rem] text-text/50">
          {formatPaymentUsd(payment.amount_usd)}
        </div> */}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.72rem]">
          <span className="text-text/34">{formatPaymentShortDate(payment.created_at)}</span>
          {isSend ? <PaymentNotificationReceipt status={payment.notification_status} /> : null}
        </div>
      </div>

      <div className="grid h-full justify-items-end gap-2">
        <span className="text-[0.72rem] text-text/46">{formatTokenAmount(payment.amount)} {payment.token_symbol}</span>
        <span className={`h-fit rounded-full px-2.5 py-1 text-[0.7rem] font-medium capitalize ${statusTone(payment.status)}`}>
          {payment.status}
        </span>
      </div>
    </button>
  );
}
