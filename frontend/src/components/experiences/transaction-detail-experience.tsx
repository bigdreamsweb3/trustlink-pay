"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PaymentNotificationReceipt } from "@/src/components/payment-notification-receipt";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { apiGet } from "@/src/lib/api";
import {
  formatTokenAmount,
  shouldPollPaymentNotification,
} from "@/src/lib/formatters";
import { shareInviteMessage } from "@/src/lib/share";
import type { PaymentDetailResponse } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";

const DETAIL_REFRESH_INTERVAL_MS = 20_000;

function formatDateTime(value: string | null) {
  if (!value) return "Pending";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortenValue(
  value: string | null | undefined,
  start = 6,
  end = 6
) {
  if (!value) return "Not available";
  if (value.length <= start + end + 3) return value;

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatFeeAmount(
  value: string | null | undefined,
  tokenSymbol: string
) {
  if (value == null) return null;

  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) return null;

  return `${formatTokenAmount(n)} ${tokenSymbol}`;
}

function statusTone(
  status:
    | PaymentDetailResponse["payment"]["status"]
    | "accepted"
    | "pending"
) {
  switch (status) {
    case "accepted":
      return "bg-[#58f2b1]/12 text-accent-deep";

    case "pending":
      return "bg-[#f3c96b]/12 text-[#f3c96b]";

    default:
      return "bg-[#ff7f7f]/12 text-[#ffadad]";
  }
}

export function TransactionDetailExperience({
  paymentId,
}: {
  paymentId: string;
}) {
  const {
    hydrated,
    accessToken,
    user,
    pendingAuth,
    completePendingAuth,
    logout,
  } = useAuthenticatedSession(`/app/activity/${paymentId}`);

  const [detail, setDetail] =
    useState<PaymentDetailResponse | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [shareBusy, setShareBusy] = useState(false);

  const shouldPollReceipt =
    detail?.viewerRole === "sender" &&
    shouldPollPaymentNotification(
      detail?.payment.notification_status
    );

  useEffect(() => {
    if (!accessToken || !user) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const r = await apiGet<PaymentDetailResponse>(
          `/api/payment/${paymentId}`,
          accessToken ?? undefined
        );

        if (!cancelled) {
          setDetail(r);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not load details"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [accessToken, paymentId, user]);

  useEffect(() => {
    if (
      !accessToken ||
      !user ||
      !shouldPollReceipt
    ) {
      return;
    }

    let cancelled = false;

    async function refresh() {
      try {
        const r = await apiGet<PaymentDetailResponse>(
          `/api/payment/${paymentId}`,
          accessToken ?? undefined
        );

        if (!cancelled) {
          setDetail(r);
        }
      } catch { }
    }

    const interval = window.setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }

      void refresh();
    }, DETAIL_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    accessToken,
    paymentId,
    shouldPollReceipt,
    user,
  ]);

  const receiptUpdatedAt = useMemo(() => {
    if (!detail) return null;

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
      ? formatFeeAmount(
        detail.payment.sender_fee_amount,
        detail.payment.token_symbol
      )
      : formatFeeAmount(
        detail.payment.claim_fee_amount,
        detail.payment.token_symbol
      )
    : null;

  if (!hydrated || !user) return null;

  return (
    <AppMobileShell
      currentTab="home"
      title="Transaction"
      subtitle="Trace payments clearly without exposing unnecessary personal details."
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
      <section className="space-y-5 pb-8">

        {/* ERROR */}
        {error ? (
          <div className="rounded-[18px] border border-[#ff7f7f]/14 bg-[#ff7f7f]/8 px-4 py-3 text-[0.82rem] text-[#ffb1b1]">
            {error}
          </div>
        ) : null}

        {/* LOADING */}
        {loading ? (
          <div className="tl-panel-header tl-field rounded-[24px] px-5 py-10">
            <SectionLoader
              size="md"
              label="Loading transaction..."
            />
          </div>
        ) : detail ? (
          <>
            {/* HERO */}
            <div className="relative overflow-hidden rounded-[30px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-5 py-6 backdrop-blur-xl">

              {/* Ambient glow */}
              <div className="absolute right-[-18%] top-[-28%] h-44 w-44 rounded-full bg-accent/10 blur-3xl" />

              {/* Top sheen */}
              <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)]" />

              <div className="relative z-10 text-center">
                <div className="tl-text-muted text-[0.62rem] uppercase tracking-[0.22em]">
                  {detail.viewerRole === "sender"
                    ? "Sent payment"
                    : "Incoming payment"}
                </div>

                <h2 className="mt-2 text-[2rem] font-bold tracking-tight text-[var(--text)]">
                  {formatTokenAmount(detail.payment.amount)}{" "}
                  {detail.payment.token_symbol}
                </h2>

                <div className="mt-3 flex justify-center">
                  <span
                    className={`rounded-full px-3 py-1 text-[0.68rem] font-semibold capitalize ${statusTone(
                      detail.payment.status
                    )}`}
                  >
                    {detail.payment.status}
                  </span>
                </div>

                <p className="mx-auto mt-4 max-w-[320px] text-[0.8rem] leading-relaxed text-[var(--text-soft)]">
                  {detail.viewerRole === "sender"
                    ? detail.receiver.manualInviteRequired
                      ? `In escrow for ${detail.receiver.phone}. Recipient has not joined TrustLink yet.`
                      : `Securely being delivered to ${detail.receiver.phone}.`
                    : `Payment from ${detail.sender.displayName}${detail.sender.handle
                      ? ` (@${detail.sender.handle})`
                      : ""
                    }.`}
                </p>
              </div>
            </div>

            {/* MAIN GRID */}
            <div className="grid gap-5 md:grid-cols-[1.25fr_0.9fr] md:items-start">

              {/* LEFT */}
              <div className="space-y-5">

                {/* PARTICIPANTS */}
                <div className="space-y-3">

                  <div className="tl-panel-header tl-field rounded-[22px] px-4 py-4">
                    <div className="flex items-center justify-between gap-4">

                      <div>
                        <div className="text-[0.68rem] uppercase tracking-[0.14em] text-[var(--text-soft)]">
                          {detail.viewerRole === "sender"
                            ? "Receiver"
                            : "Sender"}
                        </div>

                        <div className="mt-1 text-[0.9rem] font-semibold text-[var(--text)]">
                          {detail.viewerRole === "sender"
                            ? detail.receiver.phone
                            : detail.sender.displayName}
                        </div>
                      </div>

                      <ChevronRight className="h-4 w-4 text-[var(--text-soft)]" />
                    </div>
                  </div>

                  <div className="tl-panel-header tl-field rounded-[22px] px-4 py-4">
                    <div className="flex items-center justify-between gap-4">

                      <div>
                        <div className="text-[0.68rem] uppercase tracking-[0.14em] text-[var(--text-soft)]">
                          {detail.receiver.manualInviteRequired
                            ? "Invite"
                            : "WhatsApp"}
                        </div>

                        <div className="mt-1 text-[0.8rem] text-[var(--text)]">
                          {detail.receiver.manualInviteRequired
                            ? "Manual follow-up required"
                            : formatDateTime(receiptUpdatedAt)}
                        </div>
                      </div>

                      {detail.receiver.manualInviteRequired ? (
                        <span className="rounded-full bg-[#f3c96b]/12 px-3 py-1 text-[0.68rem] font-semibold text-[#f3c96b]">
                          Invite needed
                        </span>
                      ) : (
                        <PaymentNotificationReceipt
                          status={
                            detail.payment.notification_status
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* SHARE INVITE */}
                {detail.viewerRole === "sender" &&
                  detail.receiver.manualInviteRequired &&
                  detail.receiver.inviteShare ? (
                  <div className="tl-panel-header tl-field rounded-[24px] px-5 py-5">

                    <div className="text-[0.68rem] uppercase tracking-[0.18em] text-[var(--text-soft)]">
                      Share invite
                    </div>

                    <pre className="mt-4 whitespace-pre-wrap rounded-[18px] border border-white/5 bg-white/[0.02] p-4 text-[0.78rem] leading-relaxed text-[var(--text-soft)]">
                      {
                        detail.receiver.inviteShare
                          .inviteMessage
                      }
                    </pre>

                    <button
                      type="button"
                      onClick={async () => {
                        setShareBusy(true);
                        setError(null);

                        try {
                          const outcome =
                            await shareInviteMessage(
                              detail.receiver
                                .inviteShare!
                                .inviteMessage
                            );

                          if (outcome === "copied") {
                            setError(
                              "Invite copied to clipboard."
                            );
                          }
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Could not share"
                          );
                        } finally {
                          setShareBusy(false);
                        }
                      }}
                      disabled={shareBusy}
                      className="mt-4 w-full rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-[0.84rem] font-semibold text-[#04110a] transition-transform active:scale-[0.97] disabled:opacity-50"
                    >
                      {shareBusy
                        ? "Preparing..."
                        : "Share Invite"}
                    </button>
                  </div>
                ) : null}

                {/* TRACE */}
                <div>
                  <div className="mb-3 text-[0.64rem] uppercase tracking-[0.2em] text-[var(--text-soft)]">
                    Trace
                  </div>

                  <div className="space-y-2">

                    {[
                      {
                        label: "Reference",
                        value: detail.sender.referenceCode,
                      },
                      {
                        label: "Payment ID",
                        value: shortenValue(
                          detail.trace.paymentId,
                          8,
                          8
                        ),
                      },
                      {
                        label: "Created",
                        value: formatDateTime(
                          detail.payment.created_at
                        ),
                      },
                      {
                        label: "Escrow",
                        value: shortenValue(
                          detail.trace.escrowAccount
                        ),
                      },
                      ...(viewerFeeLabel &&
                        viewerFeeAmount
                        ? [
                          {
                            label: viewerFeeLabel,
                            value: viewerFeeAmount,
                          },
                        ]
                        : []),
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="tl-panel-header tl-field flex items-center justify-between gap-4 rounded-[18px] px-4 py-3.5"
                      >
                        <span className="text-[0.76rem] text-[var(--text-soft)]">
                          {row.label}
                        </span>

                        <span className="max-w-[58%] truncate text-right text-[0.8rem] font-medium text-[var(--text)]">
                          {row.value}
                        </span>
                      </div>
                    ))}

                    {[
                      {
                        label: "Deposit tx",
                        sig: detail.trace.depositSignature,
                        url: detail.trace.depositExplorerUrl,
                      },
                      {
                        label: "Claim tx",
                        sig: detail.trace.releaseSignature,
                        url: detail.trace.releaseExplorerUrl,
                      },
                      {
                        label: "TSN lease claim",
                        sig: detail.trace.tsnClaimSignature,
                        url: detail.trace
                          .tsnClaimExplorerUrl,
                      },
                      {
                        label: "TSN proof",
                        sig: detail.trace.tsnProofSignature,
                        url: detail.trace
                          .tsnProofExplorerUrl,
                      },
                      {
                        label: "Expiry tx",
                        sig: detail.trace.expirySignature,
                        url: detail.trace.expiryExplorerUrl,
                      },
                    ]
                      .filter((r) => r.sig)
                      .map((row) => (
                        <div
                          key={row.label}
                          className="tl-panel-header tl-field flex items-center justify-between gap-4 rounded-[18px] px-4 py-3.5"
                        >
                          <span className="text-[0.76rem] text-[var(--text-soft)]">
                            {row.label}
                          </span>

                          {row.url ? (
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noreferrer"
                              className="max-w-[58%] truncate text-right text-[0.8rem] font-medium text-[var(--accent-deep)] underline underline-offset-4 dark:text-[var(--accent)]"
                            >
                              {shortenValue(
                                row.sig,
                                8,
                                8
                              )}
                            </a>
                          ) : (
                            <span className="max-w-[58%] truncate text-right text-[0.8rem] font-medium text-[var(--text)]">
                              {shortenValue(
                                row.sig,
                                8,
                                8
                              )}
                            </span>
                          )}
                        </div>
                      ))}

                    {detail.receiver.releasedWallet ? (
                      <div className="tl-panel-header tl-field flex items-center justify-between gap-4 rounded-[18px] px-4 py-3.5">
                        <span className="text-[0.76rem] text-[var(--text-soft)]">
                          Released to
                        </span>

                        <span className="max-w-[58%] truncate text-right text-[0.8rem] font-medium text-[var(--text)]">
                          {shortenValue(
                            detail.receiver
                              .releasedWallet,
                            8,
                            8
                          )}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* RIGHT */}
              <div className="space-y-5">

                {/* TIMELINE */}
                <div>
                  <div className="mb-3 text-[0.64rem] uppercase tracking-[0.2em] text-[var(--text-soft)]">
                    Timeline
                  </div>

                  <div className="space-y-2">
                    {detail.timeline.map((entry) => (
                      <div
                        key={entry.id}
                        className="tl-panel-header tl-field flex items-start gap-3 rounded-[20px] px-4 py-4"
                      >
                        <span
                          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${entry.complete
                            ? "bg-[#4ae8c0]"
                            : "bg-[var(--surface-soft)]"
                            }`}
                        />

                        <div className="min-w-0 flex-1">

                          <div className="flex items-start justify-between gap-3">
                            <span className="text-[0.84rem] font-semibold text-[var(--text)]">
                              {entry.label}
                            </span>

                            <span className="shrink-0 text-[0.68rem] text-[var(--text-soft)]">
                              {formatDateTime(
                                entry.occurredAt
                              )}
                            </span>
                          </div>

                          <div className="mt-1 text-[0.74rem] leading-relaxed text-[var(--text-soft)]">
                            {entry.description}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PRIVACY */}
                <div>
                  <div className="mb-3 text-[0.64rem] uppercase tracking-[0.2em] text-[var(--text-soft)]">
                    Privacy
                  </div>

                  <div className="tl-panel-header tl-field rounded-[20px] px-4 py-4 text-[0.78rem] leading-relaxed text-[var(--text-soft)]">
                    <p>
                      {detail.privacy.senderPhonePolicy}
                    </p>

                    <p className="mt-3">
                      Deeper disclosure requires
                      TrustLink compliance review.
                    </p>
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="grid grid-cols-2 gap-3 pt-1">

                  <Link
                    href="/app/activity"
                    className="tl-button-secondary rounded-[18px] px-4 py-3.5 text-center text-[0.84rem] font-medium transition-transform active:scale-[0.97]"
                  >
                    Back
                  </Link>

                  {detail.receiver.claimReady ? (
                    <Link
                      href={`/claim/${detail.payment.id}`}
                      className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-center text-[0.84rem] font-semibold text-[#04110a] transition-transform active:scale-[0.97]"
                    >
                      Claim payment
                    </Link>
                  ) : (
                    <Link
                      href="/app"
                      className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-center text-[0.84rem] font-semibold text-[#04110a] transition-transform active:scale-[0.97]"
                    >
                      Done
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="tl-panel-header tl-field rounded-[20px] px-4 py-5 text-center text-[0.82rem] text-[var(--text-soft)]">
            Transaction details unavailable.
          </div>
        )}
      </section>
    </AppMobileShell>
  );
}