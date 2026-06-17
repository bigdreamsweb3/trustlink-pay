"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { IdentityTree } from "@/src/components/identity-tree";
import { PaymentNotificationReceipt } from "@/src/components/payment-notification-receipt";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { apiGet, apiPost } from "@/src/lib/api";
import {
  formatTokenAmount,
  shouldPollPaymentNotification,
  shouldPollTsnPayment,
  isTsnStatusFinal,
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

function shortenValue(value: string | null | undefined, start = 6, end = 6) {
  if (!value) return "Not available";
  if (value.length <= start + end + 3) return value;

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatFeeAmount(
  value: string | null | undefined,
  tokenSymbol: string,
) {
  if (value == null) return null;

  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) return null;

  return `${formatTokenAmount(n)} ${tokenSymbol}`;
}

function statusTone(
  status: PaymentDetailResponse["payment"]["status"] | "accepted" | "pending",
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

type TsnStage = NonNullable<PaymentDetailResponse["payment"]["tsn"]>["stage"];
type TsnState = NonNullable<PaymentDetailResponse["payment"]["tsn"]>;

function isSenderEscrowed(detail: PaymentDetailResponse | null | undefined) {
  const tsn = detail?.payment.tsn;
  return (
    detail?.viewerRole === "sender" &&
    (tsn?.intentStatus === "escrowed" ||
      tsn?.intentStatus === "onchain" ||
      tsn?.intentStatus === "claimed")
  );
}

function isUnpublishedTsn(tsn: TsnState) {
  return (
    tsn.stage === "reverted" &&
    !tsn.escrowTxSig &&
    (tsn.intentStatus === "failed" || tsn.intentStatus === "canceled")
  );
}

function effectiveTsnStage(detail: PaymentDetailResponse): TsnStage {
  return isSenderEscrowed(detail) ? "escrowed" : detail.payment.tsn!.stage;
}

function tsnTone(stage: TsnStage) {
  switch (stage) {
    case "intent_pending":
    case "claim_requested":
      return "bg-[#f3c96b]/12 text-[#f3c96b]";
    case "escrowed":
    case "lease_claimed":
      return "bg-[#58f2b1]/12 text-accent-deep";
    case "cranker_paid":
    case "epoch_settled":
      return "bg-[#4ae8d0]/12 text-[#4ae8d0]";
    case "reverted":
      return "bg-[#ff7f7f]/12 text-[#ffadad]";
  }
}

function tsnLabel(
  tsn: TsnState,
  viewerRole: PaymentDetailResponse["viewerRole"],
) {
  if (
    viewerRole === "sender" &&
    (tsn.intentStatus === "escrowed" ||
      tsn.intentStatus === "onchain" ||
      tsn.intentStatus === "claimed")
  ) {
    return "Escrowed";
  }
  if (isUnpublishedTsn(tsn)) return "Not published";

  switch (tsn.stage) {
    case "intent_pending":
      return "Awaiting Cranker";
    case "claim_requested":
      return "Claim queued";
    case "escrowed":
      return "Escrowed";
    case "lease_claimed":
      return "Claiming";
    case "cranker_paid":
      return viewerRole === "receiver" ? "Paid" : "Recipient paid";
    case "epoch_settled":
      return "Settled";
    case "reverted":
      if (tsn.intentStatus === "canceled") return "Canceled";
      if (tsn.intentStatus === "failed") return "Failed";
      if (tsn.claimRequestStatus === "failed")
        return viewerRole === "receiver" ? "Claim retry" : "Escrowed";
      return "Not processed";
  }
}

function paymentStatusLabel(
  status: PaymentDetailResponse["payment"]["status"],
) {
  if (status === "created") return "Processing";
  return status.replace(/_/g, " ");
}

function receiverIdentityLabel(receiver: PaymentDetailResponse["receiver"]) {
  const displayName = receiver.displayName?.trim();

  if (displayName) {
    return displayName;
  }

  if (receiver.tin) {
    return `TIN ${receiver.tin}`;
  }

  return "Recipient";
}

function receiverIdentityNameSource(
  receiver: PaymentDetailResponse["receiver"],
) {
  if (receiver.tin && receiver.displayName?.trim()) {
    return "Transfer identity name";
  }

  if (receiver.displayName?.trim()) {
    return "TrustLink display name";
  }

  return "Identity name unavailable";
}

function formatDuration(
  from: string | null | undefined,
  to: string | null | undefined,
) {
  if (!from) return null;
  const started = Date.parse(from);
  const finished = to ? Date.parse(to) : Date.now();
  if (
    !Number.isFinite(started) ||
    !Number.isFinite(finished) ||
    finished < started
  )
    return null;
  const totalSeconds = Math.max(0, Math.floor((finished - started) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function buildTsnProgress(detail: PaymentDetailResponse) {
  const tsn = detail.payment.tsn;
  if (!tsn) return null;

  const stage = effectiveTsnStage(detail);
  const currentIndex = {
    intent_pending: 0,
    claim_requested: 0,
    escrowed: 1,
    lease_claimed: 2,
    cranker_paid: 3,
    epoch_settled: 3,
    reverted: -1,
  }[stage];
  const failed = stage === "reverted";
  const settled = stage === "cranker_paid" || stage === "epoch_settled";
  const lastCompletedTimelineEntry = [...detail.timeline]
    .reverse()
    .find((entry) => entry.complete && entry.occurredAt);
  const finishedAt = settled
    ? (detail.payment.accepted_at ??
      lastCompletedTimelineEntry?.occurredAt ??
      null)
    : null;
  const elapsed = formatDuration(detail.payment.created_at, finishedAt);

  return {
    failed,
    settled,
    elapsed,
    steps: [
      {
        id: "authorized",
        label: "Authorized",
        description: "Sender co-signed the sponsored TSN payment.",
      },
      {
        id: "escrowed",
        label: "Escrowed",
        description:
          "Cranker verified the intent and locked funds into TSN escrow.",
      },
      {
        id: "claiming",
        label: "Claiming",
        description:
          "A Cranker lease is protecting the payout from duplicate execution.",
      },
      {
        id: "settled",
        label: "Settled",
        description: "Recipient payout and TSN proof are complete.",
      },
    ].map((step, index) => ({
      ...step,
      complete: settled ? true : !failed && index < currentIndex,
      active: !failed && !settled && index === currentIndex,
    })),
  };
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

  const [detail, setDetail] = useState<PaymentDetailResponse | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [shareBusy, setShareBusy] = useState(false);
  const [receiverIdentityOpen, setReceiverIdentityOpen] = useState(false);

  const urlViewParam = useSearchParams().get("view");
  const effectiveViewerRole = detail
    ? (urlViewParam === "sender" || urlViewParam === "receiver" ? urlViewParam : detail.viewerRole)
    : "sender";

  const shouldPollReceipt =
    effectiveViewerRole === "sender" &&
    shouldPollPaymentNotification(detail?.payment.notification_status);
  const shouldPollTsn = detail ? shouldPollTsnPayment(detail.payment) : false;
  const shouldPollDetail = shouldPollReceipt || shouldPollTsn;
  const isTsnFinalized = detail?.payment.tsn
    ? isTsnStatusFinal(detail.payment.tsn.intentStatus)
    : false;

  useEffect(() => {
    if (!accessToken || !user) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const r = await apiGet<PaymentDetailResponse>(
          `/api/payment/${paymentId}`,
          accessToken ?? undefined,
        );

        if (!cancelled) {
          setDetail(r);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load details");
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

  // Smart status refresh: fast polling with dynamic scheduling for real-time UX
  useEffect(() => {
    if (!accessToken || !user) return;
    if (!shouldPollDetail && isTsnFinalized) return;

    let cancelled = false;

    async function refreshStatus() {
      // Only query TSN if the transaction is not yet finalized
      if (isTsnFinalized) return;

      try {
        const result = await apiPost<{
          paymentId: string;
          tsnQueried: boolean;
          dbUpdated: boolean;
          finalized: boolean;
          nextRefreshAfterMs: number | null;
          settlementComplete: boolean;
        }>(`/api/payment/${paymentId}/refresh-status`, {}, accessToken ?? undefined);

        if (cancelled) return;

        // Reload the full detail after a refresh-status call
        const r = await apiGet<PaymentDetailResponse>(
          `/api/payment/${paymentId}`,
          accessToken ?? undefined,
          { cache: "no-store" },
        );
        if (!cancelled) setDetail(r);

        // Stop polling once finalized
        if (result.finalized) return;
      } catch {
        // Silently retry on next interval
      }
    }

    // Use dynamic setTimeout-based scheduling so interval adapts per response
    let timerId: number | undefined;

    async function poll() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        timerId = window.setTimeout(poll, 500);
        return;
      }
      if (cancelled) return;
      await refreshStatus();
      if (cancelled) return;
      timerId = window.setTimeout(poll, 800);
    }

    if (!isTsnFinalized) {
      timerId = window.setTimeout(poll, 0);
    }

    return () => { cancelled = true; if (timerId !== undefined) window.clearTimeout(timerId); };
  }, [accessToken, paymentId, shouldPollDetail, isTsnFinalized, user]);

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
    ? effectiveViewerRole === "sender"
      ? "Send fee"
      : "Claim fee"
    : null;

  const viewerFeeAmount = detail
    ? effectiveViewerRole === "sender"
      ? formatFeeAmount(
          detail.payment.sender_fee_amount,
          detail.payment.token_symbol,
        )
      : formatFeeAmount(
          detail.payment.claim_fee_amount,
          detail.payment.token_symbol,
        )
    : null;

  const tsnProgress = useMemo(
    () => (detail ? buildTsnProgress(detail) : null),
    [detail],
  );
  const heroStatusLabel = detail?.payment.tsn
    ? tsnLabel(detail.payment.tsn, effectiveViewerRole)
    : detail
      ? paymentStatusLabel(detail.payment.status)
      : "";
  const heroStatusTone = detail?.payment.tsn
    ? tsnTone(effectiveTsnStage(detail))
    : detail
      ? statusTone(detail.payment.status)
      : "";
  const receiverLabel = detail
    ? receiverIdentityLabel(detail.receiver)
    : "Recipient";
  const receiverTinNameMissing = Boolean(
    detail?.receiver.tin && !detail.receiver.displayName?.trim(),
  );

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
          <div className="rounded-[18px] border border-[#ff7f7f]/14 bg-[#ff7f7f]/8 px-4 py-3 text-[#ffb1b1]">
            {error}
          </div>
        ) : null}

        {/* LOADING */}
        {loading ? (
          <div className="tl-field rounded-[24px] px-5 py-10">
            <SectionLoader size="md" label="Loading transaction..." />
          </div>
        ) : detail ? (
          <>
            {/* HERO */}
            <div className="relative overflow-hidden rounded-[14px] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-5 py-6 backdrop-blur-xl">
              {/* Ambient glow */}
              <div className="absolute right-[-18%] top-[-28%] h-44 w-44 rounded-full bg-accent/10 blur-3xl" />

              {/* Top sheen */}
              <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.10),transparent)]" />

              <div className="relative z-10 text-center">
                <div className="tl-text-muted text-[0.62rem] uppercase tracking-[0.22em]">
                  {effectiveViewerRole === "sender"
                    ? "Sent payment"
                    : "Incoming payment"}
                </div>

                <h2 className="mt-2 text-[2rem] font-bold tracking-tight text-text">
                  {formatTokenAmount(detail.payment.amount)}{" "}
                  {detail.payment.token_symbol}
                </h2>

                <div className="mt-3 flex justify-center">
                  <span
                    className={`rounded-full px-3 py-1 tl-meta-sm font-semibold capitalize ${heroStatusTone}`}
                  >
                    {heroStatusLabel}
                  </span>
                </div>

                <p className="mx-auto mt-4 max-w-[320px] text-[0.8rem] leading-relaxed text-text-soft">
                  {effectiveViewerRole === "sender"
                    ? detail.receiver.manualInviteRequired
                      ? `In escrow for ${receiverLabel}. Recipient has not joined TrustLink yet.`
                      : `Securely being delivered to ${receiverLabel}.`
                    : `Payment from ${detail.sender.displayName}${
                        detail.sender.handle
                          ? ` (@${detail.sender.handle})`
                          : ""
                      }.`}
                </p>
              </div>
            </div>

            {tsnProgress ? (
              <div className="tl-field overflow-hidden rounded-[24px] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="tl-meta-sm uppercase tracking-[0.18em] text-text-soft">
                      TSN settlement path
                    </div>
                    <div className="mt-1 text-[0.8rem] text-text-soft">
                      {tsnProgress.settled
                        ? `Completed in ${tsnProgress.elapsed ?? "a few moments"}`
                        : tsnProgress.failed
                          ? (detail.payment.tsn?.settlementReason ??
                            "Settlement needs operator attention.")
                          : `Running for ${tsnProgress.elapsed ?? "a few seconds"}`}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 tl-meta-sm font-semibold ${detail.payment.tsn ? tsnTone(effectiveTsnStage(detail)) : ""}`}
                  >
                    {detail.payment.tsn
                      ? tsnLabel(detail.payment.tsn, effectiveViewerRole)
                      : "TSN"}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-4 gap-0">
                  {tsnProgress.steps.map((step, index) => (
                    <div key={step.id} className="relative min-w-0">
                      {index > 0 ? (
                        <div
                          className={`absolute left-[-50%] right-[50%] top-[13px] h-px ${
                            step.complete || step.active
                              ? "bg-[var(--accent)]"
                              : "bg-white/10"
                          }`}
                        />
                      ) : null}

                      <div className="relative z-10 flex flex-col items-center text-center">
                        <span
                          className={`grid h-6 w-6 place-items-center rounded-full border text-[0.62rem] font-bold ${
                            tsnProgress.failed && step.active
                              ? "border-[#ff7f7f]/40 bg-[#ff7f7f]/12 text-[#ffadad]"
                              : step.complete
                                ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                                : step.active
                                  ? "animate-pulse border-[#f3c96b]/40 bg-[#f3c96b]/12 text-[#f3c96b]"
                                  : "border-white/10 bg-white/[0.03] text-text-soft"
                          }`}
                        >
                          {index + 1}
                        </span>

                        <span className="mt-2 truncate text-[0.68rem] font-semibold text-text">
                          {step.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-[16px] border border-white/5 bg-white/[0.02] px-3 py-3 text-[0.74rem] leading-relaxed text-text-soft">
                  {tsnProgress.failed
                    ? (detail.payment.tsn?.settlementReason ??
                      "TSN marked this payment for operator review.")
                    : (tsnProgress.steps.find((step) => step.active)
                        ?.description ??
                      [...tsnProgress.steps]
                        .reverse()
                        .find((step) => step.complete)?.description ??
                      "TSN is waiting for the next settlement update.")}
                </div>
              </div>
            ) : null}

            {/* MAIN GRID */}
            <div className="grid gap-5 md:grid-cols-[1.25fr_0.9fr] md:items-start">
              {/* LEFT */}
              <div className="space-y-5">
                {/* PARTICIPANTS */}
                <div className="space-y-3">
                  <div className="tl-field rounded-[22px] px-4 py-4">
                    <button
                      type="button"
                      onClick={() => {
                        if (effectiveViewerRole === "sender") {
                          setReceiverIdentityOpen((open) => !open);
                        }
                      }}
                      className={`flex w-full items-center justify-between gap-4 text-left ${
                        effectiveViewerRole === "sender"
                          ? "cursor-pointer"
                          : "cursor-default"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="tl-meta-sm uppercase tracking-[0.14em] text-text-soft">
                          {effectiveViewerRole === "sender"
                            ? "Receiver"
                            : "Sender"}
                        </div>

                        <div className="mt-1 truncate text-[0.9rem] font-semibold text-text">
                          {effectiveViewerRole === "sender"
                            ? receiverLabel
                            : detail.sender.displayName}
                        </div>

                        {effectiveViewerRole === "sender" &&
                        detail.receiver.tin ? (
                          <div className="mt-0.5 truncate text-[0.66rem] text-text-faint">
                            TIN {detail.receiver.tin}
                          </div>
                        ) : effectiveViewerRole === "sender" &&
                          detail.receiver.handle ? (
                          <div className="mt-0.5 truncate text-[0.66rem] text-text-faint">
                            @{detail.receiver.handle}
                          </div>
                        ) : null}
                      </div>

                      <ChevronRight
                        className={`h-4 w-4 text-text-soft transition-transform ${
                          receiverIdentityOpen && effectiveViewerRole === "sender"
                            ? "rotate-90"
                            : ""
                        }`}
                      />
                    </button>

                    {effectiveViewerRole === "sender" && receiverIdentityOpen ? (
                      <div className="mt-4">
                        <IdentityTree
                          compact
                          displayName={receiverLabel}
                          nameSourceLabel={receiverIdentityNameSource(
                            detail.receiver,
                          )}
                          missingTinName={receiverTinNameMissing}
                          handle={detail.receiver.handle}
                          tin={detail.receiver.tin}
                          phoneNumber={detail.receiver.phone}
                          walletLabel={
                            detail.receiver.releasedWallet
                              ? shortenValue(detail.receiver.releasedWallet)
                              : null
                          }
                          hideMissingNodes
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="tl-field rounded-[22px] px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="tl-meta-sm uppercase tracking-[0.14em] text-text-soft">
                          {detail.receiver.manualInviteRequired
                            ? "Invite"
                            : "WhatsApp"}
                        </div>

                        <div className="mt-1 text-[0.8rem] text-text">
                          {detail.receiver.manualInviteRequired
                            ? "Manual follow-up required"
                            : formatDateTime(receiptUpdatedAt)}
                        </div>
                      </div>

                      {detail.receiver.manualInviteRequired ? (
                        <span className="rounded-full bg-[#f3c96b]/12 px-3 py-1 tl-meta-sm font-semibold text-[#f3c96b]">
                          Invite needed
                        </span>
                      ) : (
                        <PaymentNotificationReceipt
                          status={detail.payment.notification_status}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* SHARE INVITE */}
                {effectiveViewerRole === "sender" &&
                detail.receiver.manualInviteRequired &&
                detail.receiver.inviteShare ? (
                  <div className="tl-field rounded-[24px] px-5 py-5">
                    <div className="tl-meta-sm uppercase tracking-[0.18em] text-text-soft">
                      Share invite
                    </div>

                    <pre className="mt-4 whitespace-pre-wrap rounded-[18px] border border-white/5 bg-white/[0.02] p-4 text-[0.78rem] leading-relaxed text-text-soft">
                      {detail.receiver.inviteShare.inviteMessage}
                    </pre>

                    <button
                      type="button"
                      onClick={async () => {
                        setShareBusy(true);
                        setError(null);

                        try {
                          const outcome = await shareInviteMessage(
                            detail.receiver.inviteShare!.inviteMessage,
                          );

                          if (outcome === "copied") {
                            setError("Invite copied to clipboard.");
                          }
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Could not share",
                          );
                        } finally {
                          setShareBusy(false);
                        }
                      }}
                      disabled={shareBusy}
                      className="mt-4 w-full rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 font-semibold text-[#04110a] transition-transform active:scale-[0.97] disabled:opacity-50"
                    >
                      {shareBusy ? "Preparing..." : "Share Invite"}
                    </button>
                  </div>
                ) : null}

                {/* TRACE */}
                <div>
                  <div className="mb-3 text-[0.64rem] uppercase tracking-[0.2em] text-text-soft">
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
                        value: shortenValue(detail.trace.paymentId, 8, 8),
                      },
                      {
                        label: "Created",
                        value: formatDateTime(detail.payment.created_at),
                      },
                      {
                        label: "Escrow",
                        value: shortenValue(detail.trace.escrowAccount),
                      },
                      ...(viewerFeeLabel && viewerFeeAmount
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
                        className="tl-field flex items-center justify-between gap-4 rounded-[18px] px-4 py-3.5"
                      >
                        <span className="text-[0.76rem] text-text-soft">
                          {row.label}
                        </span>

                        <span className="max-w-[58%] truncate text-right text-[0.8rem] font-medium text-text">
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
                        label: "TSN escrow tx",
                        sig:
                          effectiveViewerRole === "sender"
                            ? detail.trace.tsnEscrowSignature
                            : null,
                        url:
                          effectiveViewerRole === "sender"
                            ? detail.trace.tsnEscrowExplorerUrl
                            : null,
                      },
                      {
                        label: "Claim tx",
                        sig: detail.trace.releaseSignature,
                        url: detail.trace.releaseExplorerUrl,
                      },
                      {
                        label: "TSN lease claim",
                        sig: detail.trace.tsnClaimSignature,
                        url: detail.trace.tsnClaimExplorerUrl,
                      },
                      {
                        label: "TSN proof",
                        sig: detail.trace.tsnProofSignature,
                        url: detail.trace.tsnProofExplorerUrl,
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
                          className="tl-field flex items-center justify-between gap-4 rounded-[18px] px-4 py-3.5"
                        >
                          <span className="text-[0.76rem] text-text-soft">
                            {row.label}
                          </span>

                          {row.url ? (
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noreferrer"
                              className="max-w-[58%] truncate text-right text-[0.8rem] font-medium text-[var(--accent-deep)] underline underline-offset-4 dark:text-[var(--accent)]"
                            >
                              {shortenValue(row.sig, 8, 8)}
                            </a>
                          ) : (
                            <span className="max-w-[58%] truncate text-right text-[0.8rem] font-medium text-text">
                              {shortenValue(row.sig, 8, 8)}
                            </span>
                          )}
                        </div>
                      ))}

                    {detail.receiver.releasedWallet ? (
                      <div className="tl-field flex items-center justify-between gap-4 rounded-[18px] px-4 py-3.5">
                        <span className="text-[0.76rem] text-text-soft">
                          Released to
                        </span>

                        <span className="max-w-[58%] truncate text-right text-[0.8rem] font-medium text-text">
                          {shortenValue(detail.receiver.releasedWallet, 8, 8)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* RIGHT */}
              <div className="space-y-5">
                {/* PRIVACY */}
                <div>
                  <div className="mb-3 text-[0.64rem] uppercase tracking-[0.2em] text-text-soft">
                    Privacy
                  </div>

                  <div className="tl-field rounded-[20px] px-4 py-4 text-[0.78rem] leading-relaxed text-text-soft">
                    <p>{detail.privacy.senderPhonePolicy}</p>

                    <p className="mt-3">
                      Deeper disclosure requires TrustLink compliance review.
                    </p>
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Link
                    href="/app/activity"
                    className="tl-button-secondary rounded-[18px] px-4 py-3.5 text-center font-medium transition-transform active:scale-[0.97]"
                  >
                    Back
                  </Link>

                  {detail.receiver.claimReady ? (
                    <Link
                      href={`/claim/${detail.payment.id}`}
                      className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-center font-semibold text-[#04110a] transition-transform active:scale-[0.97]"
                    >
                      Claim payment
                    </Link>
                  ) : (
                    <Link
                      href="/app"
                      className="rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 text-center font-semibold text-[#04110a] transition-transform active:scale-[0.97]"
                    >
                      Done
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="tl-field rounded-[20px] px-4 py-5 text-center text-text-soft">
            Transaction details unavailable.
          </div>
        )}
      </section>
    </AppMobileShell>
  );
}
