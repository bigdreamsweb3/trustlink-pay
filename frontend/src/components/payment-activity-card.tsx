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
    case "claimed":
      return "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]";
    case "created":
    case "refund_requested":
      return "bg-[rgba(232,168,64,0.06)] text-[var(--warning)] border border-[rgba(232,168,64,0.10)]";
    default:
      return "bg-[var(--danger-soft)] text-[var(--danger)] border border-[rgba(240,128,128,0.10)]";
  }
}

function tsnTone(stage: NonNullable<PaymentRecord["tsn"]>["stage"]) {
  switch (stage) {
    case "intent_pending":
      return "bg-[rgba(232,168,64,0.06)] text-[var(--warning)] border border-[rgba(232,168,64,0.10)]";
    case "claim_requested":
    case "lease_claimed":
      return "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]";
    case "cranker_paid":
    case "epoch_settled":
      return "bg-[rgba(74,190,208,0.06)] text-[var(--primary-accent)] border border-[rgba(74,190,208,0.10)]";
  }
}

function tsnLabel(stage: NonNullable<PaymentRecord["tsn"]>["stage"]) {
  switch (stage) {
    case "intent_pending":
      return "Escrow locked";
    case "claim_requested":
      return "Claim queued";
    case "lease_claimed":
      return "Cranker processing";
    case "cranker_paid":
      return "Paid";
    case "epoch_settled":
      return "Settled";
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

  const statusLabel = !isSend && payment.tsn ? tsnLabel(payment.tsn.stage) : payment.status.replace(/_/g, " ");
  const statusClass = !isSend && payment.tsn ? tsnTone(payment.tsn.stage) : statusTone(payment.status);

  return (
    <button
      type="button"
      onClick={() => onClick(payment.id)}
      className="tl-field group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-colors cursor-pointer hover:bg-[var(--surface-soft)] active:scale-[0.99]"
    >
      {/* Icon */}
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px]"
        style={{
          background: isSend ? "rgba(74, 190, 208, 0.06)" : "var(--accent-soft)",
          border: `1px solid ${isSend ? "rgba(74, 190, 208, 0.08)" : "var(--accent-border)"}`,
        }}
      >
        {isSend
          ? <SendIcon className="h-4 w-4" style={{ color: "var(--primary-accent)" }} />
          : <ReceiveIcon className="h-4 w-4" style={{ color: "var(--accent)" }} />
        }
      </div>

      {/* Details */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[0.82rem] font-semibold" style={{ color: "var(--text)" }}>
          <span className="truncate">{counterparty}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[0.68rem] font-medium" style={{ color: "var(--text-faint)" }}>
            {formatPaymentShortDate(payment.created_at)}
          </span>
          <span className="text-[0.58rem] font-medium uppercase tracking-[0.10em]" style={{ color: "var(--text-faint)" }}>
            {payment.reference_code}
          </span>
          {isSend ? <PaymentNotificationReceipt status={payment.notification_status} /> : null}
        </div>
      </div>

      {/* Amount + Status */}
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-[0.82rem] font-semibold" style={{ color: "var(--text)" }}>
          {isSend ? "-" : "+"}{formatTokenAmount(payment.amount)} {payment.token_symbol}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-medium ${statusClass}`}>
          {statusLabel}
        </span>
      </div>
    </button>
  );
}
