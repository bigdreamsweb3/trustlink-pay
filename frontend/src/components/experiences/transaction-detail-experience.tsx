"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PaymentNotificationReceipt } from "@/src/components/payment-notification-receipt";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { apiGet } from "@/src/lib/api";
import { formatTokenAmount, shouldPollPaymentNotification } from "@/src/lib/formatters";
import type { PaymentDetailResponse } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";

const DETAIL_REFRESH_INTERVAL_MS = 20_000;

function formatDateTime(value: string | null) {
  if (!value) {
    return "Pending";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortenValue(value: string | null, start = 6, end = 6) {
  if (!value) {
    return "Not available";
  }

  if (value.length <= start + end + 3) {
    return value;
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatFeeAmount(value: string | null | undefined, tokenSymbol: string) {
  if (value == null) {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return `${formatTokenAmount(numericValue)} ${tokenSymbol}`;
}

function statusTone(status: PaymentDetailResponse["payment"]["status"]) {
  switch (status) {
    case "accepted":
      return "bg-[#0f261d] text-[#79ffcf]";
    case "pending":
      return "bg-[#2a2412] text-[#f3c96b]";
    default:
      return "bg-[#321516] text-[#ff9c9c]";
  }
}

async function shareInviteMessage(message: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share({ text: message });
    return "shared";
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(message);
    return "copied";
  }

  throw new Error("Sharing is not available on this device.");
}

export function TransactionDetailExperience({ paymentId }: { paymentId: string }) {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } =
    useAuthenticatedSession(`/app/activity/${paymentId}`);
  const [detail, setDetail] = useState<PaymentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const shouldPollReceipt =
    detail?.viewerRole === "sender" && shouldPollPaymentNotification(detail?.payment.notification_status);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    let cancelled = false;

    async function loadDetail() {
      setLoading(true);

      try {
        const result = await apiGet<PaymentDetailResponse>(`/api/payment/${paymentId}`, accessToken ?? undefined);

        if (!cancelled) {
          setDetail(result);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load transaction details");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [accessToken, paymentId, user]);

  useEffect(() => {
    if (!accessToken || !user || !shouldPollReceipt) {
      return;
    }

    let cancelled = false;

    async function refreshDetail() {
      try {
        const result = await apiGet<PaymentDetailResponse>(`/api/payment/${paymentId}`, accessToken ?? undefined);

        if (!cancelled) {
          setDetail(result);
        }
      } catch {
        // Keep the last known detail state if polling fails.
      }
    }

    const refreshInterval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      void refreshDetail();
    }, DETAIL_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
    };
  }, [accessToken, paymentId, shouldPollReceipt, user]);

  const receiptUpdatedAt = useMemo(() => {
    if (!detail) {
      return null;
    }

    return (
      detail.whatsapp.readAt ??
      detail.whatsapp.deliveredAt ??
      detail.whatsapp.sentAt ??
      detail.whatsapp.failedAt ??
      null
    );
  }, [detail]);

  const viewerFeeLabel = detail
    ? detail.viewerRole === "sender"
      ? "Send fee"
      : "Claim fee"
    : null;

  const viewerFeeAmount = detail
    ? detail.viewerRole === "sender"
      ? formatFeeAmount(detail.payment.sender_fee_amount, detail.payment.token_symbol)
      : formatFeeAmount(detail.payment.claim_fee_amount, detail.payment.token_symbol)
    : null;

  if (!hydrated || !user) {
    return null;
  }

  return (
    <AppMobileShell
      currentTab="home"
      title="Transaction"
      subtitle="Trace the payment clearly without exposing the wrong personal details to the wrong side."
      user={user}
      showBackButton
      backHref="/app/activity"
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal
            pendingAuth={pendingAuth}
            user={user}
            onAuthenticated={completePendingAuth}
            onSignOut={logout}
          />
        ) : null
      }
    >
      <section className="space-y-5">
        {error ? (
          <div className="rounded-[22px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <section className="tl-panel p-5">
            <SectionLoader size="md" label="Loading transaction details..." />
          </section>
        ) : detail ? (
          <>
            <section className="tl-panel p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">
                    {detail.viewerRole === "sender" ? "Sent payment" : "Incoming payment"}
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-text">
                    {formatTokenAmount(detail.payment.amount)} {detail.payment.token_symbol}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-text/56">
                    {detail.viewerRole === "sender"
                      ? detail.receiver.manualInviteRequired
                        ? `This transfer is already in escrow for ${detail.receiver.phone}, but the recipient is not onboarded on TrustLink yet. Share the invite again if needed.`
                        : `This transfer is being delivered to ${detail.receiver.phone} through TrustLink escrow.`
                      : `This transfer came from ${detail.sender.displayName}${detail.sender.handle ? ` (@${detail.sender.handle})` : ""} through TrustLink escrow.`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1.5 text-[0.72rem] font-medium capitalize ${statusTone(detail.payment.status)}`}
                >
                  {detail.payment.status}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-1">
                <div className="tl-field px-4 py-4">
                  <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">
                    {detail.viewerRole === "sender" ? "Receiver" : "Sender"}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-text">
                    {detail.viewerRole === "sender" ? detail.receiver.phone : detail.sender.displayName}
                  </div>
                  <div className="mt-1 text-sm text-text/52">
                    {detail.viewerRole === "sender"
                      ? detail.receiver.manualInviteRequired
                        ? "Recipient not onboarded. TrustLink cannot auto-message this number yet."
                        : "TrustLink delivers the payment notice from its shared verified WhatsApp number."
                      : detail.sender.trustVerified
                        ? `${detail.sender.trustStatusLabel}${detail.sender.phoneMasked ? ` • ${detail.sender.phoneMasked}` : ""}`
                        : detail.sender.trustStatusLabel}
                  </div>
                </div>
                <div className="tl-field px-4 py-4">
                  <div className="text-[0.72rem] uppercase tracking-[0.18em] text-text/40">
                    {detail.receiver.manualInviteRequired ? "Invite state" : "WhatsApp receipt"}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {detail.receiver.manualInviteRequired ? (
                      <span className="rounded-full border border-[#f3c96b]/20 bg-[#2a2412] px-3 py-1 text-[0.72rem] font-medium text-[#f3c96b]">
                        Invite needed
                      </span>
                    ) : (
                      <PaymentNotificationReceipt status={detail.payment.notification_status} />
                    )}
                    <span className="text-sm text-text/56">
                      {detail.receiver.manualInviteRequired
                        ? "Manual sender follow-up required"
                        : formatDateTime(receiptUpdatedAt)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-text/46">{detail.privacy.deliveryChannelNote}</div>
                </div>
              </div>
            </section>

            {detail.viewerRole === "sender" && detail.receiver.manualInviteRequired && detail.receiver.inviteShare ? (
              <section className="tl-panel p-5">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">Share invite again</h2>
                  <p className="text-sm text-text/48">
                    This payment is already in escrow. You can regenerate and share the invite message again until the recipient joins TrustLink and claims it.
                  </p>
                </div>

                <div className="tl-field px-4 py-4">
                  <pre className="whitespace-pre-wrap text-sm leading-6 text-text/72">
                    {detail.receiver.inviteShare.inviteMessage}
                  </pre>
                  <button
                    type="button"
                    onClick={async () => {
                      setShareBusy(true);
                      setError(null);

                      try {
                        const outcome = await shareInviteMessage(detail.receiver.inviteShare!.inviteMessage);
                        setError(outcome === "copied" ? "Invite copied to clipboard." : null);
                      } catch (shareError) {
                        setError(shareError instanceof Error ? shareError.message : "Could not share invite");
                      } finally {
                        setShareBusy(false);
                      }
                    }}
                    disabled={shareBusy}
                    className="mt-4 w-full rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {shareBusy ? "Preparing share..." : "Share Invite"}
                  </button>
                </div>
              </section>
            ) : null}

            <section className="tl-panel p-5">
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">Trace details</h2>
                <p className="text-sm text-text/48">
                  Everything the current viewer is allowed to trace for this payment.
                </p>
              </div>

              <div className="space-y-3 tl-field px-4 py-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text/46">Reference</span>
                  <span className="font-medium text-text">{detail.sender.referenceCode}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text/46">Payment ID</span>
                  <span className="font-medium text-text">{shortenValue(detail.trace.paymentId, 8, 8)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text/46">Created</span>
                  <span className="font-medium text-text">{formatDateTime(detail.payment.created_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text/46">Escrow account</span>
                  <span className="font-medium text-text">{shortenValue(detail.trace.escrowAccount)}</span>
                </div>
                {viewerFeeLabel && viewerFeeAmount ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text/46">{viewerFeeLabel}</span>
                    <span className="font-medium text-text">{viewerFeeAmount}</span>
                  </div>
                ) : null}
                {detail.trace.depositSignature ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text/46">Deposit tx</span>
                    {detail.trace.depositExplorerUrl ? (
                      <a
                        href={detail.trace.depositExplorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[#7dffd9] underline underline-offset-4"
                      >
                        {shortenValue(detail.trace.depositSignature, 8, 8)}
                      </a>
                    ) : (
                      <span className="font-medium text-text">
                        {shortenValue(detail.trace.depositSignature, 8, 8)}
                      </span>
                    )}
                  </div>
                ) : null}
                {detail.trace.releaseSignature ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text/46">Claim tx</span>
                    {detail.trace.releaseExplorerUrl ? (
                      <a
                        href={detail.trace.releaseExplorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[#7dffd9] underline underline-offset-4"
                      >
                        {shortenValue(detail.trace.releaseSignature, 8, 8)}
                      </a>
                    ) : (
                      <span className="font-medium text-text">
                        {shortenValue(detail.trace.releaseSignature, 8, 8)}
                      </span>
                    )}
                  </div>
                ) : null}
                {detail.trace.expirySignature ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text/46">Expiry sweep tx</span>
                    {detail.trace.expiryExplorerUrl ? (
                      <a
                        href={detail.trace.expiryExplorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[#7dffd9] underline underline-offset-4"
                      >
                        {shortenValue(detail.trace.expirySignature, 8, 8)}
                      </a>
                    ) : (
                      <span className="font-medium text-text">
                        {shortenValue(detail.trace.expirySignature, 8, 8)}
                      </span>
                    )}
                  </div>
                ) : null}
                {detail.receiver.releasedWallet ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-text/46">Released to wallet</span>
                    <span className="font-medium text-text">{detail.receiver.releasedWallet}</span>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="tl-panel p-5">
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">Timeline</h2>
                <p className="text-sm text-text/48">A simple view of where the payment stands right now.</p>
              </div>

              <div className="space-y-3">
                {detail.timeline.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-[auto_1fr_auto] items-start gap-3 tl-field px-4 py-4"
                  >
                    <span className={`mt-1 h-3 w-3 rounded-full ${entry.complete ? "bg-[#58f2b1]" : "bg-white/14"}`} />
                    <div>
                      <div className="text-sm font-semibold text-text">{entry.label}</div>
                      <div className="mt-1 text-sm leading-6 text-text/54">{entry.description}</div>
                    </div>
                    <span className="text-right text-[0.78rem] text-text/40">{formatDateTime(entry.occurredAt)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="tl-panel p-5">
              <div className="mb-3">
                <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">Privacy</h2>
                <p className="text-sm text-text/48">Trust cues without overexposing anyone's personal details.</p>
              </div>
              <div className="tl-field px-4 py-4 text-sm leading-6 text-text/58">
                <p>{detail.privacy.senderPhonePolicy}</p>
                <p className="mt-3">
                  Any deeper disclosure should happen only through TrustLink's legal or compliance process, not through the payment interface.
                </p>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/app/activity"
                className="rounded-[20px] tl-button-secondary px-4 py-3 text-center text-sm font-medium button"
              >
                Back to activity
              </Link>
              {detail.receiver.claimReady ? (
                <Link
                  href={`/claim/${detail.payment.id}`}
                  className="tl-button-primary rounded-[20px] px-4 py-3 text-center button"
                >
                  Claim payment
                </Link>
              ) : (
                <Link
                  href="/app"
                  className="tl-button-primary rounded-[20px] px-4 py-3 text-center button"
                >
                  Done
                </Link>
              )}
            </div>
          </>
        ) : (
          <section className="tl-panel text-sm text-text/48">
            Transaction details are unavailable right now.
          </section>
        )}
      </section>
    </AppMobileShell>
  );
}
