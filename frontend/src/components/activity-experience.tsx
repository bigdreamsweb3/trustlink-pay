"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/app-mobile-shell";
import { PaymentNotificationReceipt } from "@/src/components/payment-notification-receipt";
import { PinGateModal } from "@/src/components/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { apiGet } from "@/src/lib/api";
import { formatTokenAmount, shouldPollPaymentNotification } from "@/src/lib/formatters";
import type { PaymentRecord } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";

type ActivityFilter = "all" | "transfers" | "claims" | "releases";
const ACTIVITY_REFRESH_INTERVAL_MS = 20_000;

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatUsd(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function ActivityExperience() {
  const { hydrated, accessToken, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/activity");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [visibleCount, setVisibleCount] = useState(10);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  useEffect(() => {
    if (!accessToken || !user) {
      return;
    }

    void loadActivity(accessToken);
  }, [accessToken, user]);

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const isSend = payment.sender_user_id === user?.id;

      if (filter === "all") {
        return true;
      }

      if (filter === "transfers") {
        return isSend;
      }

      if (filter === "claims") {
        return !isSend && payment.status === "pending";
      }

      if (filter === "releases") {
        return !isSend && payment.status === "accepted";
      }

      return true;
    });
  }, [filter, payments, user?.id]);

  const visiblePayments = filteredPayments.slice(0, visibleCount);
  const canLoadMore = filteredPayments.length > visiblePayments.length;
  const hasPendingSenderReceipt = useMemo(
    () =>
      payments.some(
        (payment) => payment.sender_user_id === user?.id && shouldPollPaymentNotification(payment.notification_status)
      ),
    [payments, user?.id]
  );

  useEffect(() => {
    if (!accessToken || !user || !hasPendingSenderReceipt) {
      return;
    }

    const refreshInterval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      void loadActivity(accessToken, { background: true });
    }, ACTIVITY_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(refreshInterval);
  }, [accessToken, hasPendingSenderReceipt, user]);

  async function loadActivity(token: string, options?: { background?: boolean }) {
    if (!options?.background) {
      setLoading(true);
    }

    try {
      const result = await apiGet<{ payments: PaymentRecord[] }>("/api/payment/history?limit=50", token);
      setPayments(result.payments);
      setError(null);
    } catch (loadError) {
      if (!options?.background) {
        setError(loadError instanceof Error ? loadError.message : "Could not load activity");
      }
    } finally {
      if (!options?.background) {
        setLoading(false);
      }
    }
  }

  if (!hydrated || !user) {
    return null;
  }

  return (
    <AppMobileShell
      currentTab="home"
      title="Activity"
      subtitle="Review transfers, claims, releases, and WhatsApp receipt updates."
      user={user}
      showBackButton
      backHref="/app"
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} />
        ) : null
      }
    >
      <section className="space-y-5">
        {error ? <div className="rounded-[22px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">{error}</div> : null}

        <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {([
              ["all", "All"],
              ["transfers", "Transfers"],
              ["claims", "Claims"],
              ["releases", "Releases"]
            ] as const).map(([value, label]) => {
              const active = filter === value;

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setFilter(value);
                    setVisibleCount(10);
                  }}
                  className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                    active
                      ? "bg-[#58f2b1]/12 text-[#7dffd9]"
                      : "border border-white/10 bg-black/20 text-white/62"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            {loading ? (
              <>
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[22px] border border-white/6 bg-black/25 px-3 py-3">
                    <div className="h-12 w-12 rounded-[18px] bg-white/8" />
                    <div className="space-y-2">
                      <div className="h-3.5 w-24 rounded-full bg-white/8" />
                      <div className="h-3 w-36 rounded-full bg-white/8" />
                      <div className="h-2.5 w-20 rounded-full bg-white/8" />
                    </div>
                    <div className="justify-self-end space-y-2">
                      <div className="h-6 w-16 rounded-full bg-white/8" />
                      <div className="h-3 w-14 rounded-full bg-white/8" />
                    </div>
                  </div>
                ))}
              </>
            ) : visiblePayments.length === 0 ? (
              <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-5 text-sm text-white/46">No activity for this filter yet.</div>
            ) : (
              visiblePayments.map((payment) => {
                const isSend = payment.sender_user_id === user.id;
                const counterparty = isSend
                  ? `To ${payment.receiver_phone}`
                  : `From ${payment.sender_display_name_snapshot}`;

                return (
                  <button
                    key={payment.id}
                    type="button"
                    onClick={() => router.push(`/app/activity/${payment.id}`)}
                    className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[22px] border border-white/6 bg-black/25 px-3 py-3 text-left transition hover:border-white/12 hover:bg-black/35"
                  >
                    <div className={`grid h-12 w-12 place-items-center rounded-[18px] text-[0.68rem] font-bold tracking-[0.14em] ${isSend ? "bg-[#16283a] text-[#99cfff]" : "bg-[#0f261d] text-[#79ffcf]"}`}>
                      {isSend ? "OUT" : "IN"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {formatTokenAmount(payment.amount)} {payment.token_symbol}
                      </div>
                      <div className="truncate text-sm text-white/50">
                        {counterparty} - {payment.reference_code}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.72rem]">
                        <span className="text-white/34">{formatShortDate(payment.created_at)}</span>
                        {isSend ? <PaymentNotificationReceipt status={payment.notification_status} /> : null}
                      </div>
                    </div>
                    <div className="grid justify-items-end gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[0.7rem] font-medium capitalize ${payment.status === "accepted" ? "bg-[#0f261d] text-[#79ffcf]" : payment.status === "pending" ? "bg-[#2a2412] text-[#f3c96b]" : "bg-[#321516] text-[#ff9c9c]"}`}>
                        {payment.status}
                      </span>
                      <span className="text-[0.72rem] text-white/46">{formatUsd(payment.amount_usd)}</span>
                      <span className="text-[0.72rem] font-medium text-white/70">Open</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {!loading && canLoadMore ? (
            <button
              type="button"
              onClick={() => setVisibleCount((current) => current + 10)}
              className="mt-4 w-full rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/76 transition hover:bg-white/[0.05]"
            >
              Load more activity
            </button>
          ) : null}

          {loading ? (
            <div className="mt-4">
              <SectionLoader label="Loading activity..." />
            </div>
          ) : null}
        </section>
      </section>
    </AppMobileShell>
  );
}






