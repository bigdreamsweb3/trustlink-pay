"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PaymentActivityCard } from "@/src/components/payment-activity-card";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { SectionLoader } from "@/src/components/section-loader";
import { apiGet } from "@/src/lib/api";
import { shouldPollPaymentNotification } from "@/src/lib/formatters";
import type { PaymentRecord } from "@/src/lib/types";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";

type ActivityFilter = "all" | "transfers" | "claims" | "releases";
const ACTIVITY_REFRESH_INTERVAL_MS = 20_000;

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

        <section className="rounded-[28px] border border-white/8 bg-[#111B1C]/5 p-4">
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
                  className={`rounded-full px-3 py-2 text-xs font-medium transition ${active
                    ? "bg-[#58f2b1]/12 text-[#7dffd9]"
                    : "border border-white/10 bg-black/20 text-text/62"
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
                  <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[22px] border border-white/6 bg-surface px-3 py-3">
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
              <div className="rounded-[20px] border border-white/8 bg-black/20 px-4 py-5 text-sm text-text/46">No activity for this filter yet.</div>
            ) : (
              visiblePayments.map((payment) => (
                <PaymentActivityCard
                  key={payment.id}
                  payment={payment}
                  currentUserId={user.id}
                  onClick={(paymentId) => router.push(`/app/activity/${paymentId}`)}
                />
              ))
            )}
          </div>

          {!loading && canLoadMore ? (
            <button
              type="button"
              onClick={() => setVisibleCount((current) => current + 10)}
              className="mt-4 w-full rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm font-medium text-text/76 transition hover:bg-white/[0.05]"
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






