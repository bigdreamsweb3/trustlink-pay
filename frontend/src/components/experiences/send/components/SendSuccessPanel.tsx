"use client";

import Link from "next/link";
import { PaymentNotificationReceipt } from "@/src/components/payment-notification-receipt";
import { SuccessIcon } from "@/src/components/success-icon";
import { shortenAddress } from "@/src/lib/address";
import { shareInviteMessage } from "@/src/lib/share";
import { formatReceiptTime, paymentStatusLabel } from "@/src/components/experiences/send/utils/formatting";
import type { SendSuccessState } from "@/src/components/experiences/send/types";

type SendSuccessPanelProps = {
  sendSuccess: SendSuccessState;
  receiptTimestamp: string | null;
  shareBusy: boolean;
  onShareBusyChange: (value: boolean) => void;
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onSendAnother: () => void;
};

export function SendSuccessPanel({
  sendSuccess,
  receiptTimestamp,
  shareBusy,
  onShareBusyChange,
  onError,
  onToast,
  onSendAnother,
}: SendSuccessPanelProps) {
  async function handleShareInvite() {
    onShareBusyChange(true);
    try {
      const outcome = await shareInviteMessage(sendSuccess.inviteShare!.inviteMessage);
      onToast(outcome === "shared" ? "Share dialog opened." : "Invite copied.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not share invite");
    } finally {
      onShareBusyChange(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center py-2">
        <SuccessIcon className="mx-auto h-14 w-14" />
        <div className="mt-4 tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]">Awaiting Cranker Verification</div>
        <h2 className="mt-2 text-[1.6rem] font-bold tracking-tight text-text">
          {sendSuccess.amount} {sendSuccess.token}
        </h2>
        <p className="mt-2  leading-relaxed text-text-soft max-w-[300px] mx-auto">
          {sendSuccess.manualInviteRequired
            ? `Authorization queued for ${sendSuccess.recipientName}. Share the invite manually.`
            : sendSuccess.notificationRetrying
              ? `Authorization queued for ${sendSuccess.recipientName}. WhatsApp delivery retrying.`
              : `Intent queued for ${sendSuccess.recipientName}. Waiting for Cranker verification and on-chain submission.`}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          {[
            { label: "Recipient", value: sendSuccess.recipientName },
            { label: "WhatsApp", value: sendSuccess.receiverPhone },
            { label: "Reference", value: sendSuccess.referenceCode },
            { label: "Status", value: paymentStatusLabel(sendSuccess.status), capitalize: true },
          ].map((row) => (
            <div key={row.label} className="tl-panel tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
              <span className="text-[0.78rem] text-text-soft">{row.label}</span>
              <span className={` font-medium text-text ${row.capitalize ? "capitalize" : ""}`}>{row.value}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {!sendSuccess.manualInviteRequired ? (
            <div className="tl-panel tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
              <span className="text-[0.78rem] text-text-soft">WhatsApp receipt</span>
              <PaymentNotificationReceipt status={sendSuccess.notificationStatus} />
            </div>
          ) : (
            <div className="tl-panel tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
              <span className="text-[0.78rem] text-text-soft">Sender invite</span>
              <span className=" font-medium text-text">Share manually</span>
            </div>
          )}

          {sendSuccess.notificationRetrying ? (
            <div className="tl-panel tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
              <span className="text-[0.78rem] text-text-soft">Delivery retries</span>
              <span className=" font-medium text-text">{sendSuccess.notificationAttemptCount}</span>
            </div>
          ) : null}

          {!sendSuccess.manualInviteRequired && receiptTimestamp ? (
            <div className="tl-panel tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
              <span className="text-[0.78rem] text-text-soft">Receipt updated</span>
              <span className=" font-medium text-text">{formatReceiptTime(receiptTimestamp)}</span>
            </div>
          ) : null}

          <div className="tl-panel tl-field flex items-center justify-between rounded-[18px] px-4 py-3">
            <span className="text-[0.78rem] text-text-soft">{sendSuccess.blockchainMode === "mock" ? "Mock ref" : sendSuccess.blockchainMode === "tsn" ? "Intent id" : "Deposit tx"}</span>
            <span className=" font-medium text-text">{shortenAddress(sendSuccess.blockchainSignature)}</span>
          </div>
        </div>
      </div>

      <div className="text-[0.72rem] text-[var(--text-soft)] leading-relaxed">
        {sendSuccess.blockchainMode === "mock"
          ? "Mock mode — reference is not an on-chain signature."
          : sendSuccess.blockchainMode === "tsn"
            ? "Authorization is in the TSN mempool. Your wallet did not broadcast a Solana transaction; a Cranker verifies and submits settlement."
            : "Receipts refresh while delivery is unresolved."}
      </div>

      {sendSuccess.manualInviteRequired && sendSuccess.inviteShare ? (
        <div className="tl-panel tl-field rounded-[22px] px-5 py-4">
          <div className="tl-text-muted text-[0.62rem] uppercase tracking-[0.2em]">Shareable invite</div>
          <pre className="mt-3 whitespace-pre-wrap  leading-relaxed text-text-soft">{sendSuccess.inviteShare.inviteMessage}</pre>
          <button
            type="button"
            onClick={() => void handleShareInvite()}
            disabled={shareBusy}
            className="mt-4 w-full rounded-[18px] bg-[linear-gradient(135deg,var(--accent),var(--accent-icon))] px-4 py-3.5  font-semibold text-[#04110a] disabled:opacity-50 cursor-pointer active:scale-[0.97] transition-transform"
          >
            {shareBusy ? "Preparing..." : "Share Invite"}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:max-w-[400px]">
        <Link href="/app" className="tl-button-secondary rounded-[18px] px-4 py-3.5 text-center  font-medium cursor-pointer active:scale-[0.97] transition-transform">Back home</Link>
        <button type="button" onClick={onSendAnother} className="rounded-[18px] bg-[linear-gradient(135deg,var(--accent),var(--accent-icon))] px-4 py-3.5  font-semibold text-[#04110a] cursor-pointer active:scale-[0.97] transition-transform">Send another</button>
      </div>
    </div>
  );
}
